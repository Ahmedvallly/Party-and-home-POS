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
- Invoicing and Sales orders use a transaction editor with customer details, line items, comments, and totals. On phones, line items become editable cards.
- Press F4 to find stock or Ctrl+Enter to review a transaction.
- Sales orders are stored as quotations and leave stock unchanged. Convert a confirmed quotation to an invoice to deduct stock once.
- Saved invoices are final. This version does not include refunds, credit notes, payment processing, or separate tax calculations.
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
