const fs = require('fs-extra')
const path = require('path')
const state = require('./state')

/**
 * Save the current configuration to a file.
 */
exports.save = function(){
    fs.writeFileSync(state.configPath, JSON.stringify(state.config, null, 4), 'UTF-8')
}

/**
 * Load the configuration into memory. If a configuration file exists,
 * that will be read and saved. Otherwise, a default configuration will
 * be generated. Note that "resolved" values default to null and will
 * need to be externally assigned.
 */
exports.load = function(){
    let doLoad = true

    if(!fs.existsSync(state.configPath)){
        // Create all parent directories.
        fs.ensureDirSync(path.join(state.configPath, '..'))
        if(fs.existsSync(state.configPathLEGACY)){
            fs.moveSync(state.configPathLEGACY, state.configPath)
        } else {
            doLoad = false
            state.config = state.DEFAULT_CONFIG
            exports.save()
        }
    }
    if(doLoad){
        let doValidate = false
        try {
            state.config = JSON.parse(fs.readFileSync(state.configPath, 'UTF-8'))
            doValidate = true
        } catch (err){
            state.logger.error(err)
            state.logger.info('Configuration file contains malformed JSON or is corrupt.')
            state.logger.info('Generating a new configuration file.')
            fs.ensureDirSync(path.join(state.configPath, '..'))
            state.config = state.DEFAULT_CONFIG
            exports.save()
        }
        if(doValidate){
            state.config = validateKeySet(state.DEFAULT_CONFIG, state.config)
            exports.save()
        }
    }
    state.logger.info('Successfully Loaded')
}

/**
 * Validate that the destination object has at least every field
 * present in the source object. Assign a default value otherwise.
 *
 * @param {Object} srcObj The source object to reference against.
 * @param {Object} destObj The destination object.
 * @returns {Object} A validated destination object.
 */
function validateKeySet(srcObj, destObj){
    if(srcObj == null){
        srcObj = {}
    }
    const validationBlacklist = ['authenticationDatabase', 'javaConfig']
    const keys = Object.keys(srcObj)
    for(let i=0; i<keys.length; i++){
        if(typeof destObj[keys[i]] === 'undefined'){
            destObj[keys[i]] = srcObj[keys[i]]
        } else if(typeof srcObj[keys[i]] === 'object' && srcObj[keys[i]] != null && !(srcObj[keys[i]] instanceof Array) && validationBlacklist.indexOf(keys[i]) === -1){
            destObj[keys[i]] = validateKeySet(srcObj[keys[i]], destObj[keys[i]])
        }
    }
    return destObj
}
