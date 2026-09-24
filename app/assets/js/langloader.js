const fs = require('fs-extra')
const path = require('path')
const { parse } = require('smol-toml')

let lang

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        const sourceValue = source[key]
        const targetValue = target[key]
        if (sourceValue != null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
            && targetValue != null && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
            target[key] = deepMerge(targetValue, sourceValue)
        } else {
            target[key] = sourceValue
        }
    }
    return target
}

exports.loadLanguage = function(id){
    lang = deepMerge(lang || {}, parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`), 'utf8')) || {})
}

exports.query = function(id, placeHolders){
    let query = id.split('.')
    let res = lang
    for(let q of query){
        res = res[q]
    }
    let text = res === lang ? '' : res
    if (placeHolders) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

exports.setupLanguage = function(){
    // Load Language Files
    exports.loadLanguage('en_US')
    // Uncomment this when translations are ready
    //exports.loadLanguage('xx_XX')

    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}
