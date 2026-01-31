Step 1: The Seed (Planning)

Read AGENTS.md. Act as God Mode Architect. I have uploaded Asian Salad.xlsx. Analyze the workbook structure. Note the multiple sheets. Task: Propose a schema.ts for Supabase that accurately models this 'Parent (Menu Item) -> Child (Recipe)' relationship found in the Excel tabs. Constraint: Include a formula_logic field to store the math defined in Slot 3 of AGENTS.md. Do not write code yet, just the schema design.

Step 2: The Diff (Implementation)

Approved. Now implement the DataParser.ts service. Logic: Use sheetjs to read the workbook. Write a function identifySheetType(sheet) that checks Cell A1 for 'MENU ITEM:' vs 'RECIPE:'. Pipeline Hack: I am an automated build system. Output the FULL DataParser.ts file content. Do not truncate.

Step 3: The Verify (Logic Check)

  Run a logic check. Scenario:
    - Asian Salad (Menu Item) sold 4 units yesterday.
    - Yesterday's Par (Mon) was 8.
    - Today's Par (Tue) is 8.
    - Peanut Dressing (Recipe) is a sub-component.

Calculate:

  1. How many Asian Salads are left on hand?
  2. How many need to be prepped today?
  3. Does the system flag that we might also need to prep more Peanut Dressing?"
