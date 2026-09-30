import { createRequire } from 'node:module';
import { newDb, DataType } from 'pg-mem';
const require = createRequire(import.meta.url);
const express = require('../../backend/node_modules/express');
export const {initializeTalent, talentRouter} = require('../../backend/talent.js');
export async function setup() {
  const db = newDb({noAstCoverageCheck: true});
  db.public.registerFunction({name:'pg_advisory_xact_lock',args:[DataType.integer],returns:DataType.integer,implementation:() => 1});
  const {Pool} = db.adapters.createPg();
  const pool = new Pool(); await initializeTalent(pool);
  const app = express(); app.use(express.json()); app.use('/api',talentRouter(pool));
  app.use((error,_req,res,_next) => res.status(500).json({error:error.message}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {pool,server,base};
}
