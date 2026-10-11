// HTTP proxy and quota behavior in PGlite using the CI-only HTTP response fixture.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const db=new PGlite(),read=p=>fs.readFileSync(p,'utf8');
await db.exec(read('tests/communications-db-fixture.sql'));await db.exec(read('tests/social-db-fixture.sql'));await db.exec('begin');
for(const f of ['backend/profile-messages.sql','backend/biotech-owner-access.sql','backend/communications.sql','backend/social.sql','tests/navigation-http-fixture.sql'])await db.exec(read(f));
const migration=read('backend/navigation.sql').replace('create extension if not exists http with schema extensions;','');await db.exec(migration);await db.exec(migration);await db.exec(read('tests/navigation-db.sql'));
const owner=(await db.query('select owner_id from imperium_access_control')).rows[0].owner_id;await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,role:'authenticated'})]);
assert.equal((await db.query('select imperium_navigation_status() s')).rows[0].s.configured,false);
assert.equal((await db.query("select imperium_navigation_search('Szczecin') s")).rows[0].s.code,'not_configured');
await db.query('select imperium_navigation_configure($1)',['test-only-invalid-api-key-123456789']);
const found=(await db.query("select imperium_navigation_search('Szczecin') s")).rows[0].s;assert.equal(found.items[0].title,'Szczecin');
const logged=(await db.query('select * from navigation_test_requests')).rows;assert.equal(logged.length,1);assert.equal(logged[0].endpoint,'https://geocode.search.hereapi.com/v1/geocode');assert.equal(logged[0].query.apiKey,'test-only-invalid-api-key-123456789');
await db.exec('update imperium_private.navigation_usage set requests=200');assert.equal((await db.query("select imperium_navigation_search('Berlin') s")).rows[0].s.code,'rate_limit');assert.equal((await db.query('select count(*)::int n from navigation_test_requests')).rows[0].n,1,'Quota blocks upstream request');
await db.exec('rollback');await db.close();console.log('PASS: provider secrecy, vehicle validation, limited participant access, explicit missing configuration, HTTP parameter mapping and quotas.');
})().catch(e=>{console.error(e);process.exitCode=1});
