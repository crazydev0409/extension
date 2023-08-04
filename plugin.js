import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function enc(str) {

  var res = '';
  var arr = [];
  // str = btoa(str);
  for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i)-0x13;
      res += code;
      if (i !== str.length - 1)
          res += ',';
  }

  return '[' + res + ']';
}

export function replaceWordEncoded({ base_dir, from, to }) {
  return {
    name: base_dir,
    writeBundle: {
      sequential: true,
      order: 'post',
      async handler({ file }) {
        const fileContent = await readFile(resolve(process.cwd(), file), 'utf8');
        writeFile(file, fileContent.replace('__' + from + '__', enc(to)));
      }
    }
  };
}

export function replaceWordArrayEncoded({ base_dir, arr }) {
  return {
    name: base_dir,
    writeBundle: {
      sequential: true,
      order: 'post',
      async handler({ file }) {
        var fileContent = await readFile(resolve(process.cwd(), file), 'utf8');

        arr.forEach(element => {
          fileContent = fileContent.replace('__' + element.from + '__', enc(element.to));
        });

        writeFile(file, fileContent);
      }
    }
  };
}

export async function replaceWordOnFile(filename, from, to ) {
  const fileContent = await readFile(resolve(process.cwd(), filename), 'utf8');
  writeFile(filename, fileContent.replace('__' + from + '__', to));
}