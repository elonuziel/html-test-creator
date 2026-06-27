# LLM Guide: Extracting Exam Answers from CSV to JSON

This guide provides step-by-step instructions for a future LLM tasked with extracting correct exam answers from a generated CSV file and saving them into a structured JSON file. 

## Context
The CSV files represent student test answers and the correct exam answers. The structure contains Hebrew metadata, headers, and specific cell formatting containing various data points.

## Step-by-Step Instructions

### Step 1: Analyze the CSV Header and Legend
Before extracting data, identify the legend that explains the cell formatting. It is usually found in the first few lines of the CSV.
* Example legend line: `מספר התשובה בטופס אפס={4}     מספר השאלה בטופס אפס=[3]     התשובה הנכונה=(2)     התשובה שסומנה=1`
* **Key Takeaway:** The "Correct Answer" (התשובה הנכונה) is located inside the parentheses `()`.

### Step 2: Locate the Columns
Find the row containing the column headers. Look for columns labeled `שאלה 1`, `שאלה 2`, etc.
* Ignore metadata columns like `שאלון` (Questionnaire/Form number), `תש' נכונות` (Total correct answers), and `שאלות שנענו` (Answered questions).
* Note the total number of questions based on the highest `שאלה X` column.

### Step 3: Locate the Data Row
Find the row directly beneath the column headers. This row contains the answer mappings for a specific exam version (e.g., Form `102`).

### Step 4: Parse the Cell Values
Iterate through the columns corresponding to the questions (`שאלה 1` to `שאלה N`). The standard cell format looks like this:
```text
3 (2) [15] {4}
```
* **Extraction:** Use Regex or string matching to extract the integer located inside the parentheses `()`. In the example above, the correct answer is `2`.

### Step 5: Handle Edge Cases (Cancelled Questions)
Watch out for cells that do not conform to the standard numerical formatting. 
* **Example:** A cell might contain Hebrew text like `והת` (likely a truncation/typo of `מבוטלת` or `התשובה מבוטלת`, meaning the question was cancelled). 
* **Resolution:** Map any non-conformant text strings representing cancelled or invalidated questions to `null` in the final JSON.

### Step 6: Construct the JSON Output
Map the question numbers (derived from the column headers, 1 to N) to the extracted integers or `null` values. Ensure numerical values are typed as integers, not strings.

**Target JSON Structure:**
```json
{
  "1": 3,
  "2": 3,
  "3": 4,
  ...
  "30": null,
  "31": 3
}
```

### Step 7: Save the File
Write the constructed JSON object to `answers.json` so it can easily be loaded into HTML/JavaScript applications.
