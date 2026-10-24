import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
const local=process.env.RACE_URL||'http://127.0.0.1:8080';
const config=await(await fetch(local+'/config.json')).json();
const tunnel=process.env.TUNNEL_URL||config.publicOrigin;
if(!tunnel)throw Error('Start npm run event or set TUNNEL_URL first.');
const results=[];
for(const [transport,origin]of [['local',local],['https-tunnel',tunnel]]){
 const samples=[],errors=[];let cold=null;
 for(let i=0;i<31;i++){
  const start=performance.now();
  try{
   const response=await fetch(origin+'/api/race/preflight',{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   await response.json();const elapsed=performance.now()-start;if(i===0)cold=elapsed;else samples.push(elapsed);
  }catch(error){errors.push({request:i,message:error.message,elapsedMs:performance.now()-start});}
 }
 samples.sort((a,b)=>a-b);results.push({transport,requests:31,warmSamples:samples.length,coldMs:cold,p50Ms:samples[Math.floor(samples.length*.5)]??null,p95Ms:samples[Math.floor(samples.length*.95)]??null,errors});
}
await writeFile(process.env.LATENCY_OUTPUT||'artifacts/tunnel-latency.json',JSON.stringify({measuredAt:new Date().toISOString(),kind:'HTTP preflight round trip; not stroke acknowledgment',results},null,2));console.log(JSON.stringify(results));
if(results.some(result=>result.errors.length))process.exitCode=1;
