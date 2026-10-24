import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,weld,simplify,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
await MeshoptSimplifier.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('assets/source/tree/tree.gltf');
// Shore-distance asset: preserve the photographic base colors, omit unseen micro-surface maps.
for(const m of doc.getRoot().listMaterials()){m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setRoughnessFactor(.95).setMetallicFactor(0);}
await doc.transform(prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.008,error:.02}),textureCompress({encoder:sharp,targetFormat:'jpeg',resize:[512,512],quality:80}),prune());
await mkdir('public/assets/scenery',{recursive:true});await io.write('public/assets/scenery/island-tree.glb',doc);
await writeFile('public/assets/scenery/CREDITS.txt','Island Tree 01 — Poly Haven, CC0 1.0.\nSource: https://polyhaven.com/a/island_tree_01\nOriginal mesh simplified and textures resized for mobile by scripts/build-tree.mjs.\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\n');
console.log(doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives().map(p=>p.getIndices().getCount()/3)));
