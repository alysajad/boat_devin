// Optional offline asset preparation. Runtime requires only the checked-in KTX2 files.
import {execFileSync} from 'node:child_process';
import {cp,mkdir,appendFile} from 'node:fs/promises';
const toktx=process.env.TOKTX||'.tools/ktx/bin/toktx';
for(const name of ['wood-color','shore-color','wood-normal']){
 const normal=name==='wood-normal';execFileSync(toktx,['--t2','--encode',normal?'uastc':'etc1s',...(normal?['--uastc_quality','2','--zcmp','18']:['--qlevel','160']),'--genmipmap','--assign_oetf',normal?'linear':'srgb',`public/assets/river/${name}.ktx2`,`public/assets/river/${name}.jpg`],{stdio:'inherit'});
}
await mkdir('public/assets/basis',{recursive:true});for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])await cp('node_modules/three/examples/jsm/libs/basis/'+name,'public/assets/basis/'+name);
