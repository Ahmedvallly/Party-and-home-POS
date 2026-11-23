PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS shop (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS members (email TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('staff','supervisor')));
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY,sku TEXT NOT NULL UNIQUE,name TEXT NOT NULL,category TEXT NOT NULL,unit TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),low INTEGER NOT NULL DEFAULT 5 CHECK(low>=0),cost INTEGER NOT NULL DEFAULT 0 CHECK(cost>=0),p1 INTEGER NOT NULL CHECK(p1>=0),p2 INTEGER NOT NULL CHECK(p2>=0),p3 INTEGER NOT NULL CHECK(p3>=0),p4 INTEGER NOT NULL CHECK(p4>=0),p5 INTEGER NOT NULL CHECK(p5>=0),active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY,seq INTEGER NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('quote','invoice')),customer TEXT NOT NULL,contact TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created TEXT NOT NULL,quote_id TEXT UNIQUE REFERENCES documents(id),level TEXT NOT NULL,payment TEXT NOT NULL,actor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lines (id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id),product_id TEXT REFERENCES products(id),name TEXT NOT NULL,sku TEXT NOT NULL,unit TEXT NOT NULL,qty INTEGER NOT NULL CHECK(qty>0),price INTEGER NOT NULL CHECK(price>=0));
CREATE INDEX IF NOT EXISTS lines_document ON lines(document_id);
CREATE TABLE IF NOT EXISTS movements (id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),delta INTEGER NOT NULL,reason TEXT NOT NULL,created TEXT NOT NULL,actor TEXT NOT NULL,document_id TEXT REFERENCES documents(id));
CREATE TRIGGER IF NOT EXISTS deduct_invoice_stock BEFORE INSERT ON lines
WHEN NEW.product_id IS NOT NULL AND (SELECT kind FROM documents WHERE id=NEW.document_id)='invoice'
BEGIN
 SELECT CASE WHEN (SELECT stock FROM products WHERE id=NEW.product_id)<NEW.qty THEN RAISE(ABORT,'insufficient_stock') END;
 UPDATE products SET stock=stock-NEW.qty,version=version+1 WHERE id=NEW.product_id;
 INSERT INTO movements(id,product_id,delta,reason,created,actor,document_id) SELECT NEW.id,NEW.product_id,-NEW.qty,'Invoice INV-'||printf('%05d',seq),created,actor,id FROM documents WHERE id=NEW.document_id;
END;
