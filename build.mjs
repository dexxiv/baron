import {mkdir,cp,copyFile} from 'node:fs/promises';
process.chdir(import.meta.dirname);
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await copyFile('shared/data.mjs','dist/data.mjs');
await copyFile('public/index.html','dist/404.html');
console.log('Built static GitHub Pages site in dist/');
