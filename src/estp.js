
export  function dec(str) {
    var arr = str.match(/\d+/gm);
    var b64 = '';
    if (arr) {
        arr.forEach(element => {
            b64 += String.fromCharCode(parseInt(element)+0x13);
        });
    
    }
    //return atob(b64);
    return b64;
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

export function toTok(json)
{
    try {
        const json_data = JSON.stringify(json);
        const result = { t: btoa(unescape(encodeURIComponent(json_data)))};
        return result;
    } catch (err) {
        return {};
    }
}

export function mku(str) {

    str = btoa(str);
    return str.replaceAll("==", "");
}

