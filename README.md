# Party & Home POS

A point-of-sale app for Party & Home, with the shop's logo and colours, product and department management, five selling prices, invoicing, sales orders, stock tracking, reports, and staff access.

## Run locally

Install Node.js 22.13 or newer, then double-click **Start POS.cmd**. Alternatively:

```powershell
cd party-home-pos
npm start
```

Open `http://localhost:3000` on the computer. Create an owner account on first use, enter shop details, and add products. No package installation is required to run the local app.

Phones and other computers on the same shop network can sign in using `http://<computer-ip>:3000`. The server prints available local network addresses when starting. Keep the host computer running; Windows Firewall must allow the connection on the private network. Use `ipconfig` to check the computer's address. Set `POS_HOST=127.0.0.1` to limit access to the host computer.

## Sales and stock

- Point of sale supports product pictures and editable order quantities and prices.
- Stockmaster shows large product pictures, names, detailed descriptions, packaging, stock, and all five selling prices. Search by description, packaging, stock code, or department; filter active, low-stock, and archived products.
- Product forms include a detailed description and packaging / pack size (for example, `12 x 100 pieces per carton`). Packaging describes contents; stock deductions still use the product's selling unit.
- Invoice and sales order stock search results show a large picture, description, packaging, stock availability, and the selected selling price. Added transaction lines also show the picture and packaging.
- Invoicing and Sales orders use a transaction editor with customer details, line items, comments, and totals. On phones, line items become editable cards.
- Press F4 to find stock or Ctrl+Enter to review a transaction.
- Enter or scan a product's SKU and a quantity to add lines quickly. Totals update while quantities and prices are edited.
- Save customers with account codes, phone and email, billing and delivery addresses, VAT numbers, payment terms, and default price levels. Select a customer to fill a transaction, or view their document history from Customers.
- Unfinished orders are saved in the current browser for the signed-in user and restored after refresh. Drafts are local to that browser; they do not reserve stock or sync between devices.
- Copy saved documents into a new sales order draft for repeat purchases. Saving or clearing the current draft is required first.
- Save & print opens the browser print dialog after the document has saved. Saved documents can be viewed, reprinted, or saved as PDFs from Sales documents.
- Sales orders are stored as quotations and leave stock unchanged. Convert a confirmed quotation to an invoice to deduct stock once.
- Saved invoices are final. This version does not include refunds, credit notes, payment processing, or an accounts receivable ledger.
- Settings includes print configuration for the shop's VAT number, an optional VAT-inclusive rate, banking details, and payment instructions. VAT is off by default; enabling it extracts included VAT from entered selling prices without adding it again.
- Printed invoices and sales order notes use A4 layouts with customer and delivery details, references, numbered item lines, totals, signature space, and page numbering. Long documents continue onto additional pages.
- Customer details, shop details, and print configuration are captured on new documents, so later changes do not rewrite those saved records.
- Only owners and supervisors can view or edit cost prices. Customer documents exclude costs.

## Data

The local app uses SQLite at `party-home-pos/data/pos.sqlite`. Uploaded product pictures are in `party-home-pos/data/images/`. Devices accessing the same server share the same database. Live shop records, account data, uploaded pictures, and backups are excluded from Git.

Back up the complete data folder with the app stopped, or use a consistent SQLite backup procedure. Never delete the data folder to update the application.

## Checks and portable build

Run from `party-home-pos`:

```powershell
npm test
npm run test:browser
npm run build
```

The browser checks require Google Chrome at its standard Windows installation path. They use isolated test data and a temporary browser profile, with Chrome's sandbox disabled for the test process. The portable build creates a Cloudflare Worker in `dist/`; local development runs the Node.js server. Building does not publish a hosted website.

See [START-HERE.txt](party-home-pos/START-HERE.txt) for more operational details.
