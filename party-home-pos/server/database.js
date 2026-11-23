import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function openDatabase(filename){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 sqlite.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('./departments.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('./customers.sql',import.meta.url),'utf8'));
 return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);let values=[];const wrapper={bind(...args){values=args;return wrapper;},async first(){return stmt.get(...values)||null;},async all(){return {results:stmt.all(...values)};},runSync(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};},async run(){return wrapper.runSync();}};return wrapper;},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.runSync());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
