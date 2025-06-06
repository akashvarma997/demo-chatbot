import XLSX from "xlsx";

export function readBeautyCatalog(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  let context = "Here is the catalog of our beauty products:\n";
  for (const row of rows) {
    context += `Product: ${row["Product Name"]}, Category: ${row["Category"]}, Skin Type: ${row["Skin Type"]}, Description: ${row["Description"]}, Price: ₹${row["Price (INR)"]}\n\n`;
  }

  return context;
}
