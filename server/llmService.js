const { GoogleGenerativeAI } = require("@google/generative-ai");

// First LLM call: Extract field selectors from form HTML
async function extractFieldSelectorsFromDOM(formHTML, apiKey) {
   try {
      if (!apiKey) {
         console.error("[LLM] No API Key provided");
         return [];
      }

      console.error("[LLM STEP 1] Extracting field selectors from DOM...");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are a form field extraction expert. Analyze the HTML and extract ALL form fields with their selectors.

FORM HTML:
${formHTML}

EXTRACT ALL FORM FIELDS - BE THOROUGH:
- Input fields (text, email, tel, number, date, etc.)
- Textareas
- Select dropdowns (including those with role="listbox" or custom dropdowns)
- Radio button groups (including div[role="radiogroup"])
- Checkboxes (including div[role="checkbox"] or input[type="checkbox"])
- Hidden inputs that become visible (like "Other" text fields for radio buttons)

CRITICAL SELECTOR PRIORITY RULES (MUST FOLLOW STRICTLY):
1. For radio button groups (Google Forms): Use the container selector (e.g., div[role="list"] or div[aria-labelledby="..."]) that encompasses ALL options.
2. For checkboxes: If it's a group for one question, use the container.
3. For individual inputs: Use the unique attribute selector (aria-labelledby, aria-label, etc.)
4. ALWAYS prefer aria-labelledby or aria-label over ID selectors
5. NEVER use generic IDs like #i32, #i35 - always use descriptive attribute selectors

CRITICAL INSTRUCTIONS:
1. Scan the ENTIRE HTML - do not skip any sections
2. **GROUPING**: For radio groups, create ONE entry for the whole question. 
   - Selector: Use the container element
   - Label: The question text
   - Type: "radio"
   - Options: Array of all available labels/text for the options
3. For checkbox groups, also create ONE entry per group if they relate to a single question (e.g., "Hobbies").
4. Include "Other" text fields that appear with radio buttons as a separate field or as part of the options logic.
5. BE CONSISTENT - use the same selector format every time for the same field

For each field, provide:
1. A unique CSS selector following the priority rules above
2. Field label/question text (extract from aria-labelledby or nearby text)
3. Field type (text, email, tel, date, textarea, select, radio, checkbox)
4. For select/radio/checkbox: list of available options

RETURN ONLY A JSON ARRAY in this format:
[
  {
    "selector": "div[role='radio'][aria-label='Male']",
    "label": "Gender - Male",
    "type": "radio",
    "options": ["Male", "Female", "Other"]
  }
]

IMPORTANT:
- Return ONLY the JSON array, no markdown, no explanations
- IMPORTANT: Do NOT extract fields that are invisible or hidden (e.g., style="display:none", style="visibility:hidden", type="hidden" unless it's a special case mentioned above)
- Include ONLY visible form fields that a user would actually interact with
- Include ALL visible form fields - checkboxes, dropdowns, everything
- For checkbox groups, create ONE entry per checkbox with its label
- ALWAYS use descriptive attribute selectors (aria-label, aria-labelledby, role, type)
- NEVER use short IDs like #i32 - use full attribute selectors instead
- Do NOT skip fields at the end of the HTML`;

      console.error("[LLM STEP 1] Sending DOM to Gemini for field extraction...");
      const result = await model.generateContent(prompt);
      let responseText = result.response.text();

      console.error("[LLM STEP 1] Raw Response:");
      console.error(responseText);

      // Clean markdown formatting
      responseText = responseText
         .replace(/```json/gi, '')
         .replace(/```/g, '')
         .trim();

      const fields = JSON.parse(responseText);
      console.error(`[LLM STEP 1] Successfully extracted ${fields.length} fields`);
      console.error("[LLM STEP 1] Fields:", JSON.stringify(fields, null, 2));

      return fields;

   } catch (error) {
      console.error("[LLM STEP 1] ERROR:", error.message);
      console.error("[LLM STEP 1] Stack:", error.stack);
      return [];
   }
}

// Second LLM call: Map user data to field selectors
async function mapFieldsWithLLM(questions, formData, apiKey, formHTML = null) {
   try {
      if (!apiKey) {
         console.error("[LLM] No API Key provided");
         return {};
      }

      console.error("[LLM STEP 2] Starting field mapping...");
      console.error("[LLM STEP 2] Number of fields:", questions.length);
      console.error("[LLM STEP 2] Form Data:", JSON.stringify(formData));

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Create a simple mapping of fields
      const fieldsList = questions.map(q => ({
         id: q.selector,
         label: q.text,
         type: q.inputType,
         options: q.options && q.options.length > 0 ? q.options.slice(0, 20) : []
      }));

      const prompt = `You are a form-filling assistant. Map the user data to form fields.

USER DATA:
${JSON.stringify(formData, null, 2)}

FORM FIELDS:
${JSON.stringify(fieldsList, null, 2)}

CRITICAL RULES:
1. "Mobile" or "Phone" fields MUST get phone numbers (like "9876543210"), NEVER gender values
2. "Email" fields get email addresses
3. "Gender" fields get Male/Female/Other in general will be a radio button
4. "Name" fields get name data
5. For dropdown/select/radio fields, match the value to one of the available options
6. Match fields by semantic meaning, not exact text match
8. **CHECKBOX GROUPS & ARRAYS**: 
   - If a field is "type": "checkbox", and its label or option text matches OR contains a value inside a user data array (e.g., "hobbies": ["Cricket", "Art"]), map that field to "true".
   - Example: A field with label "Hobbies - Cricket" MUST be mapped to "true" if the user provided ["Cricket"].
   - If a checkbox does NOT have any matching data in the user data, map it to "null".
9. **NAME FIELDS**: BE CAREFUL with family members. If the text says "Father's name is Ravi", DO NOT put "Ravi" in the main "Name" field. Only use data that clearly belongs to the user for the user's fields.
10. **CRITICAL: NO HALLUCINATIONS**: If a field cannot be matched to any data in the USER DATA, set its value to exactly "null". DO NOT use your internal knowledge to invent names, emails, phones, or addresses.
11. You MUST include every field ID from the FORM FIELDS list in your output. If the data is missing, its value MUST be "null".

Return a SIMPLE JSON object mapping ALL field IDs to their values.
Example format:
{
  "#firstName": "Kabilan",
  "[name='email']": "kabilan@example.com", 
  "[name='gender']": "Male",
  "[name='mobile']": "9876543210",
  "[name='date']": "12/22/2003",
  "#hobbies-checkbox-1": "Sports",
  "#hobbies-checkbox-2": "Reading"
}

IMPORTANT: 
- Return ONLY the JSON object, no markdown, no code blocks, no explanations
- Do NOT include fields with empty strings like "#hobbies-checkbox-3": ""
- Only include fields that should be filled with actual values`;

      console.error("[LLM STEP 2] Sending mapping request to Gemini...");
      const result = await model.generateContent(prompt);
      let responseText = result.response.text();

      console.error("[LLM STEP 2] Raw Response:");
      console.error(responseText);

      // Clean markdown formatting
      responseText = responseText
         .replace(/```json/gi, '')
         .replace(/```/g, '')
         .trim();

      console.error("[LLM STEP 2] Cleaned Response:");
      console.error(responseText);

      const parsedResult = JSON.parse(responseText);
      console.error("[LLM STEP 2] Successfully parsed! Mappings:", Object.keys(parsedResult).length);
      console.error("[LLM STEP 2] Mappings:", JSON.stringify(parsedResult, null, 2));

      return parsedResult;

   } catch (error) {
      console.error("[LLM STEP 2] ERROR:", error.message);
      console.error("[LLM STEP 2] Stack:", error.stack);
      return {};
   }
}

module.exports = { extractFieldSelectorsFromDOM, mapFieldsWithLLM };
