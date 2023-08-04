
import { terser } from "rollup-plugin-terser";
import { replaceWordArrayEncoded, replaceWordOnFile } from './plugin';
import postcss from 'rollup-plugin-postcss'

//process.env.NODE_ENV = 'debug';

require('dotenv').config();

const isChrome = process.env.BROWSER === undefined ? true : process.env.BROWSER === 'chrome';
const from = 'MYDOMAIN'; // this var for replaceWord plugin

let mydomain = isChrome ? process.env.chrome_url : process.env.edge_url; // this var for replaceWord plugin

if (process.env.NODE_ENV === 'debug') {
  mydomain = process.env.debug_url;
}

let const_map = [
  { from : 'MYDOMAIN', to : mydomain},
  { from : 'INJECTURL', to : process.env.inject_url},
  { from : 'REDIRECTMARK', to : process.env.redirect_mark},
  { from : 'TURNERDATAXYZ', to : process.env.turner_data_xyz},
  { from : 'XYZINSTALL', to : process.env.xyz_install},
  { from : 'XYZVISIT', to : process.env.xyz_visit}
];

//console.log(process.env.chrome_url, " = ", process.env.edge_url);
const base_dir = isChrome ? "dist-chrome" : "dist-edge";


console.log('>>> Processing ... Browser:', process.env.BROWSER, ", Build:", process.env.NODE_ENV);
console.log('-- Main domain: ', mydomain);
console.log('-- Inject sub url: ', process.env.inject_url);
console.log('-- Base Dir: ', base_dir);

console.log('>>> Copying ...');

var js_files = [
  '/data/engine/block/isolated.js', 
  //'/data/engine/block/main.js', 
  '/data/options/index.js', 
  '/data/popup/index.js', 
  '/data/popup/tld.js', 
  '/data/ui/index.js'
];

var main_js_files = [
  '/work.js'
];

var plan_files = [
  "/_locales/es/messages.json",
  "/data/popup/index.html", 
];

var options = {
  compress : {
    drop_console : true,
  },
  mangle: {
     toplevel: true,
  },
  nameCache: {}
};


const app_title_shadow = "APPTITLE";
const app_title = process.env.app_title;

plan_files.forEach((element) => {

  replaceWordOnFile(base_dir + element, app_title_shadow, app_title);
 
});

var export_list = [];

main_js_files.forEach((element) => {

  const work_js_path = base_dir + element;

  export_list.push(
    {
      input: "src" + element,
      output: {
        file: work_js_path,
        format: "iife",
        sourcemap: false,
      },
      plugins: [
        replaceWordArrayEncoded({base_dir : work_js_path, arr : const_map}),
        process.env.NODE_ENV === 'production' ? terser(options) : ''
      ]
    }
  );
});

// const work_js_path = base_dir + "/work.js";

// var export_list = [
//   {
//     input: "src/work.js",
//     output: {
//       file: work_js_path,
//       format: "iife",
//       sourcemap: false,
//     },
//     plugins: [
//       replaceWord({ base_dir, from, to }),
//       replaceWord({base_dir : work_js_path, from : inject_url_mark, to : inject_suburl}),
//       process.env.NODE_ENV === 'production' ? terser(options) : ''
//     ]
//   }
// ];

js_files.forEach((element) => {

  export_list.push({
    input: "src" + element,
    output: {
      file: base_dir + element,
      format: "iife",
      sourcemap: false,
    },
    plugins: [
      postcss({
        extract: true,
      }),
      process.env.NODE_ENV === 'production' ? terser(options) : ''
    ]
  });
});


export default export_list;
