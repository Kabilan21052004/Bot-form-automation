const puppeteer = require('puppeteer');
const { extractFieldSelectorsFromDOM, mapFieldsWithLLM } = require('./llmService');
const cacheService = require('./cacheService');

const normalize = (text) => text !== undefined && text !== null
    ? text.toString().toLowerCase().replace(/[\s_\-\*\.]+/g, '').replace(/[^a-z0-9]/g, '')
    : '';

const flattenFormData = (data, parentKey = '', result = {}) => {
    if (Array.isArray(data)) {
        if (parentKey && data.every(item => typeof item !== 'object' || item === null)) {
            result[parentKey] = data.join(', ');
        }
        data.forEach((value, index) => {
            const key = parentKey ? `${parentKey}.${index}` : `${index}`;
            flattenFormData(value, key, result);
        });
    } else if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, value]) => {
            const newKey = parentKey ? `${parentKey}.${key}` : key;
            if (value && typeof value === 'object') {
                flattenFormData(value, newKey, result);
            } else {
                result[newKey] = value;
            }
        });
    } else if (parentKey) {
        result[parentKey] = data;
    }
    return result;
};

const runTask = async (task, logCallback, askUserCallback) => {
    logCallback(`Starting automation for: ${task.url}`);

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
        logCallback(`Navigating to form...`);
        await page.goto(task.url, { waitUntil: 'networkidle2' });
        await sleep(2000);

        // Scroll to load all elements
        await page.evaluate(async () => {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollTo(0, 0);
        });

        // Use LLM exclusively for mapping
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables. Please add it to your .env file.');
        }

        // Stage 1: Analyze DOM for Fields
        logCallback("Step 1: Checking cache for form fields...");

        let fields = cacheService.getFields(task.url);

        if (fields) {
            logCallback("INFO: Cache hit! Using stored field mappings.");
        } else {
            logCallback("INFO: Cache miss. Extracting fields via Gemini LLM...");
            const formHTML = await page.evaluate(() => {
                const forms = document.querySelectorAll('form');
                if (forms.length > 0) return forms[0].outerHTML;
                return document.body.outerHTML;
            });

            fields = await extractFieldSelectorsFromDOM(formHTML, apiKey);

            if (fields && Array.isArray(fields) && fields.length > 0) {
                cacheService.saveFields(task.url, fields);
                logCallback(`INFO: Successfully extracted ${fields.length} fields and saved to cache.`);
            }
        }

        if (!fields || fields.length === 0) {
            throw new Error('No fields extracted from form. Please check the form HTML.');
        }

        // Filter out file input fields - we don't support file uploads
        fields = fields.filter(field => field.type !== 'file');

        logCallback(`[LLM STEP 1] Found ${fields.length} fields (file inputs filtered out)`);

        // Parse form data
        const formData = typeof task.formData === 'string' ? JSON.parse(task.formData) : task.formData;

        console.error('\n========== FORM DATA ==========');
        console.error(JSON.stringify(formData, null, 2));
        console.error('===============================\n');

        console.error('\n========== EXTRACTED FIELDS (LLM) ==========');
        fields.forEach((field, idx) => {
            console.error(`${idx + 1}. ${field.label} (${field.type}) - ${field.selector}`);
            if (field.options && field.options.length > 0) {
                console.error(`   Options: ${field.options.join(', ')}`);
            }
        });
        console.error('==========================================\n');

        // STEP 2: Use LLM to map user data to extracted selectors
        logCallback(`[LLM STEP 2] Mapping user data to ${fields.length} fields...`);
        const llmMappings = await mapFieldsWithLLM(
            fields.map(field => ({
                selector: field.selector,
                text: field.label,
                inputType: field.type,
                options: field.options || []
            })),
            formData,
            apiKey
        );

        fields.forEach(field => {
            if (llmMappings && Object.prototype.hasOwnProperty.call(llmMappings, field.selector)) {
                field.resolvedValue = llmMappings[field.selector];
                field.valueSource = 'LLM';
                // Use error to ensure visibility in standard task flow logs if using console
                console.error(`[MAPPING] "${field.label}" -> "${field.resolvedValue}"`);
            } else {
                field.resolvedValue = "null";
                console.error(`[MAPPING] "${field.label}" -> NO MATCH (null)`);
            }
        });

        // Process each field
        for (const field of fields) {
            let value = field.resolvedValue;

            // If a value is missing (mapped to "null" by LLM prompt logic), handle skip/ask
            if (value === "null" || value === null || value === undefined || value === "") {
                const lowerLabel = field.label.toLowerCase();

                // For optional fields and radios, we skip if data is missing
                if (field.type === 'radio' || lowerLabel.includes('other') || lowerLabel.includes('response')) {
                    logCallback(`[SKIP] No matching data found for "${field.label}"`);
                    continue;
                }

                // For checkboxes, we treat 'null' as 'do not check' and proceed so it's logged
                if (field.type === 'checkbox') {
                    value = false;
                } else {
                    // For critical text fields, we ask the user
                    logCallback(`WAITING: No data found for "${field.label}". Asking user...`);
                    try {
                        value = await askUserCallback(`Please provide a value for: ${field.label}`);
                    } catch (err) {
                        logCallback(`[ERROR] Interactive prompt failed for "${field.label}": ${err.message}`);
                        logCallback(`[SKIP] Skipping "${field.label}" due to interaction error.`);
                        continue;
                    }
                }
            }

            // Find element - use evaluate to avoid detached frame issues
            const elementExists = await page.evaluate((selector) => {
                return !!document.querySelector(selector);
            }, field.selector);

            if (!elementExists) {
                logCallback(`[ERROR] Element not found: "${field.label}"`);
                continue;
            }

            // Scroll to element
            await page.evaluate((selector) => {
                const el = document.querySelector(selector);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, field.selector);
            await sleep(300);

            // Fill based on type
            try {
                if (field.type === 'radio') {
                    // Radio button - handle containers or specific buttons
                    const selected = await page.evaluate((selector, val) => {
                        const root = document.querySelector(selector);
                        if (!root) return { success: false, matched: null };

                        const target = String(val).toLowerCase().trim();

                        // Strategy 1: If the root IS the button (old behavior support)
                        if (root.getAttribute('role') === 'radio' || root.type === 'radio') {
                            const label = (root.getAttribute('aria-label') || root.innerText || '').toLowerCase().trim();
                            if (label === target || target === 'true' || target === 'male' || target === 'female') {
                                root.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                root.click();
                                return { success: true, matched: label };
                            }
                        }

                        // Strategy 2: Look for buttons INSIDE the container (Group behavior)
                        const options = [...root.querySelectorAll('div[role="radio"], input[type="radio"], label')];
                        for (const opt of options) {
                            const optText = (opt.getAttribute('aria-label') || opt.innerText || opt.value || '').toLowerCase().trim();
                            if (optText === target || optText.includes(target)) {
                                opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                opt.click();
                                // Special handling for Google Forms styled radios
                                if (opt.getAttribute('role') === 'radio') {
                                    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                    opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                    opt.setAttribute('aria-checked', 'true');
                                }
                                return { success: true, matched: optText };
                            }
                        }

                        return { success: false, matched: null };
                    }, field.selector, value);

                    if (selected.success) {
                        logCallback(`[FILLED] Radio "${field.label}" = "${selected.matched}"`);
                    } else {
                        logCallback(`[ERROR] Could not find radio option for "${field.label}" with value "${value}"`);
                    }
                    await sleep(300);
                }
                else if (field.type === 'checkbox') {
                    // Checkbox - handle Google Forms div[role="checkbox"] and standard inputs
                    logCallback(`[ACTION] Checking checkbox "${field.label}" with value: ${value}`);
                    const checked = await page.evaluate((selector, val) => {
                        const element = document.querySelector(selector);
                        if (!element) return { success: false, checked: false };

                        const valStr = String(val).toLowerCase().trim();
                        const shouldCheck = val === true || valStr === 'true' || valStr === 'yes' || valStr === '1' || (val !== 'null' && val !== null && val !== undefined && val !== '');

                        // Check if it's a Google Forms styled checkbox (div with role="checkbox")
                        if (element.getAttribute('role') === 'checkbox') {
                            const isChecked = element.getAttribute('aria-checked') === 'true';

                            if (shouldCheck && !isChecked) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.click();
                                return { success: true, checked: true };
                            }
                            return { success: true, checked: isChecked };
                        }

                        // Standard checkbox input
                        if (shouldCheck && !element.checked) {
                            element.click();
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        return { success: true, checked: element.checked };
                    }, field.selector, value);

                    if (checked.success) {
                        logCallback(`[FILLED] Checkbox "${field.label}" = ${checked.checked}`);
                    } else {
                        logCallback(`[ERROR] Could not find checkbox for "${field.label}"`);
                    }
                    await sleep(300);
                }
                else if (field.type === 'select-one' || field.type === 'select') {
                    // Dropdown - handle Google Forms div[role="listbox"] and standard selects
                    const isListbox = await page.evaluate((selector) => {
                        const element = document.querySelector(selector);
                        return element && element.getAttribute('role') === 'listbox';
                    }, field.selector);

                    if (isListbox) {
                        // Google Forms listbox - click to open
                        await page.evaluate((selector) => {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.click();
                            }
                        }, field.selector);

                        // Wait for options to appear
                        await sleep(800);

                        // Find and click the matching option
                        const selected = await page.evaluate((val) => {
                            const options = document.querySelectorAll('div[role="option"]');
                            const target = String(val).toLowerCase().trim();

                            for (const option of options) {
                                const optionText = option.innerText.toLowerCase().trim();
                                if (optionText === target || optionText.includes(target)) {
                                    option.click();
                                    return { success: true, matched: optionText };
                                }
                            }
                            return { success: false, matched: null };
                        }, value);

                        if (selected.success) {
                            logCallback(`[FILLED] Dropdown "${field.label}" = "${selected.matched}"`);
                        } else {
                            logCallback(`[ERROR] Option "${value}" not found in "${field.label}"`);
                        }
                    } else {
                        // Standard select element (including Subjects dropdown)
                        const selected = await page.evaluate((selector, val) => {
                            const el = document.querySelector(selector);
                            if (!el) return { success: false, matched: null };

                            const target = String(val).toLowerCase().trim();

                            // First pass: exact text match
                            for (const option of el.options) {
                                const optText = option.text.toLowerCase().trim();
                                if (optText === target) {
                                    el.value = option.value;
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    return { success: true, matched: option.text };
                                }
                            }

                            // Second pass: contains match
                            for (const option of el.options) {
                                const optText = option.text.toLowerCase().trim();
                                const optVal = option.value.toLowerCase().trim();
                                if (optText.includes(target) || target.includes(optText) || optVal === target) {
                                    el.value = option.value;
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    return { success: true, matched: option.text };
                                }
                            }

                            return { success: false, matched: null };
                        }, field.selector, value);

                        if (selected.success) {
                            logCallback(`[FILLED] Dropdown "${field.label}" = "${selected.matched}"`);
                        } else {
                            logCallback(`[ERROR] Option "${value}" not found in "${field.label}"`);
                        }
                    }
                    await sleep(300);
                }
                else if (field.type === 'date' || field.label.toLowerCase().includes('date') || field.label.toLowerCase().includes('birth')) {
                    // Special handling for date fields - set value directly
                    try {
                        await page.evaluate((selector, dateValue) => {
                            const el = document.querySelector(selector);
                            if (el) {
                                el.focus();
                                // Clear existing value
                                el.value = '';
                                // Set the new value (LLM provides correct format)
                                el.value = dateValue;
                                // Trigger events
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }, field.selector, value);

                        // Wait a bit then blur to trigger validation and move to next field
                        await sleep(300);
                        await page.evaluate((selector) => {
                            const el = document.querySelector(selector);
                            if (el) {
                                el.blur();
                                el.dispatchEvent(new Event('blur', { bubbles: true }));
                            }
                        }, field.selector);

                        // Close date picker calendar if it's open
                        await sleep(200);
                        await page.keyboard.press('Escape');

                        logCallback(`[FILLED] Date "${field.label}" = "${value}"`);
                    } catch (err) {
                        logCallback(`[ERROR] Failed to fill date "${field.label}": ${err.message}`);
                    }
                }
                else {
                    // Check if it's a React Select input (special handling needed)
                    if (field.selector.includes('react-select')) {
                        // React Select dropdown - type to search and select
                        try {
                            await page.click(field.selector);
                            await sleep(300);
                            await page.type(field.selector, String(value), { delay: 50 });
                            await sleep(500);
                            // Press Enter to select the first match
                            await page.keyboard.press('Enter');
                            await sleep(300);
                            logCallback(`[FILLED] React Select "${field.label}" = "${value}"`);
                        } catch (err) {
                            logCallback(`[ERROR] Failed to fill React Select "${field.label}": ${err.message}`);
                        }
                    } else if (field.type === 'textarea') {
                        // Textarea - special handling
                        await page.evaluate((selector, val) => {
                            const el = document.querySelector(selector);
                            if (el) {
                                el.focus();
                                el.value = '';
                                el.value = String(val);
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.blur();
                            }
                        }, field.selector, value);
                        await sleep(200);
                        logCallback(`[FILLED] Textarea "${field.label}"`);
                    } else {
                        // Text input (text, email, number, tel, etc.)
                        await page.evaluate((selector, val) => {
                            const el = document.querySelector(selector);
                            if (el) {
                                el.focus();
                                el.value = '';
                                el.value = String(val);
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.blur();
                            }
                        }, field.selector, value);
                        await sleep(200);
                        logCallback(`[FILLED] Text "${field.label}"`);
                    }
                }
            } catch (err) {
                logCallback(`[ERROR] Failed to fill "${field.label}": ${err.message}`);
            }
        }

        // Submit form
        logCallback(`Submitting form...`);
        await sleep(2000);

        const submitted = await page.evaluate(() => {
            // Try multiple strategies to find submit button
            let submitBtn = null;

            // Strategy 1: Look for common submit button text
            const buttons = [...document.querySelectorAll('button, input[type="submit"], div[role="button"], span[role="button"]')];
            submitBtn = buttons.find(b => {
                const text = (b.innerText || b.value || b.textContent || '').toLowerCase();
                return text.includes('submit') || text.includes('send') || text.includes('register') || text.includes('next');
            });

            // Strategy 2: For Google Forms, look for the submit button by aria-label or specific classes
            if (!submitBtn) {
                submitBtn = document.querySelector('[aria-label*="Submit"], [aria-label*="submit"], .freebirdFormviewerViewNavigationSubmitButton');
            }

            // Strategy 3: Last button in the form
            if (!submitBtn && buttons.length > 0) {
                submitBtn = buttons[buttons.length - 1];
            }

            if (submitBtn) {
                submitBtn.click();
                return true;
            }
            return false;
        });

        if (submitted) {
            logCallback(`Form submitted successfully`);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => { });
        } else {
            logCallback(`Warning: Could not find submit button`);
        }

        logCallback(`Task completed!`);

    } catch (error) {
        logCallback(`ERROR: ${error.message}`);
        console.error('Automation error:', error);
    } finally {
        await sleep(2000);
        await browser.close();
    }
};

module.exports = { runTask };
