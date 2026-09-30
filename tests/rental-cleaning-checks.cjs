const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('app.js','utf8'),ctx={};vm.createContext(ctx);
for(const name of ['mapRental','rentalTotals','invoiceLineDefaults']){const at=src.indexOf('function '+name+'('),end=src.indexOf('\nfunction ',at+1);vm.runInContext(src.slice(at,end),ctx);}
const old=ctx.mapRental({area_sqm:10,price_sqm_net:20,price_sqm_gross:24.6,parking_net:30,parking_gross:36.9,internet_net:20,internet_gross:24.6});assert.equal(old.cleaningNet,0);assert.equal(ctx.rentalTotals(old).net,250);
const rental={...old,cleaningNet:100,cleaningGross:123};assert.equal(ctx.rentalTotals(rental).net,350);assert.ok(Math.abs(ctx.rentalTotals(rental).gross-430.5)<0.001);
const lines=ctx.invoiceLineDefaults(rental);assert.equal(lines.length,4);assert.equal(lines[3].description,'Sprzątanie');assert.equal(lines[3].unit_net,'100');assert.equal(ctx.invoiceLineDefaults(old).length,3);
for(const part of ['cleaning_net:value.cleaningNet','cleaning_gross:value.cleaningGross','value.cleaningNet,value.cleaningGross','id="f-rental-cleaning-net"','id="f-rental-cleaning-gross"'])assert.ok(src.includes(part),part);
console.log('Rental cleaning: legacy defaults, monthly totals, invoice lines and save fields passed');
