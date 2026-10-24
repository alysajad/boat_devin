import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Director} from '../app/director.ts';
import {defaultSettings,type Race} from '../app/race-v2.ts';
const race=()=>({round:1,settings:defaultSettings(),boatOrder:['a','b','c'],boats:{a:{progress:100,finishTime:null},b:{progress:80,finishTime:null},c:{progress:79,finishTime:null}}}) as unknown as Race;
test('overview first, six-second shots, close-battle focus, four-second finish minimum, manual override',()=>{
 const d=new Director(),r=race();assert.equal(d.select(r,0).shot,'overview');assert.equal(d.select(r,5999).shot,'overview');assert.deepEqual(d.select(r,6000),{shot:'side',boat:'b'});r.boats.a.progress=230;assert.equal(d.select(r,9999).shot,'side');assert.equal(d.select(r,10000).shot,'finish');assert.deepEqual(d.select(r,20000,'bow','c'),{shot:'bow',boat:'c'});assert.equal(d.select(r,30000,'auto','c').boat,'c');assert.equal(d.select(r,40000).shot,'finish');r.round++;assert.equal(d.select(r,41000).shot,'overview');
});
