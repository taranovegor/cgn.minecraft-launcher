const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const ConfigManager = require('../configmanager')
const { mcVersionAtLeast, getMojangOS } = require('../common')
const { AUTHLIB_INJECTOR } = require('../endpoints')

module.exports = {

    /**
     * Construct the argument array that will be passed to the JVM process.
     *
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the full JVM arguments for this process.
     */
    constructJVMArguments(mods, tempNativePath){
        if(mcVersionAtLeast('1.13', this.server.rawServer.minecraftVersion)){
            return this._constructJVMArguments113(mods, tempNativePath)
        } else {
            return this._constructJVMArguments112(mods, tempNativePath)
        }
    },

    /**
     * Construct the argument array that will be passed to the JVM process.
     * This function is for 1.12 and below.
     *
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the full JVM arguments for this process.
     */
    _constructJVMArguments112(mods, tempNativePath){

        let args = []

        // Classpath Argument
        args.push('-cp')
        args.push(this.classpathArg(mods, tempNativePath).join(this.constructor.getClasspathSeparator()))

        // Java Arguments
        if(process.platform === 'darwin'){
            args.push('-Xdock:name=CraftGameLauncher')
            args.push('-Xdock:icon=' + path.join(__dirname, '..', '..', 'images', 'minecraft.icns'))
        }
        args.push('-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id))
        args.push('-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id))
        args = args.concat(ConfigManager.getJVMOptions(this.server.rawServer.id))
        args.push('-Djava.library.path=' + tempNativePath)

        // Main Java Class
        args.push(this.modManifest.mainClass)

        // Forge Arguments
        args = args.concat(this._resolveForgeArgs())

        return args
    },

    /**
     * Construct the argument array that will be passed to the JVM process.
     * This function is for 1.13+
     *
     * Note: Required Libs https://github.com/MinecraftForge/MinecraftForge/blob/af98088d04186452cb364280340124dfd4766a5c/src/fmllauncher/java/net/minecraftforge/fml/loading/LibraryFinder.java#L82
     *
     * @param {Array.<Object>} mods An array of enabled mods which will be launched with this process.
     * @param {string} tempNativePath The path to store the native libraries.
     * @returns {Array.<string>} An array containing the full JVM arguments for this process.
     */
    _constructJVMArguments113(mods, tempNativePath){

        const argDiscovery = /\${*(.*)}/
        let nativesExtractPath = tempNativePath

        // JVM Arguments First
        let args = [...this.vanillaManifest.arguments.jvm]

        // Debug securejarhandler
        // args.push('-Dbsl.debug=true')

        if(this.modManifest.arguments.jvm != null) {
            for(const argStr of this.modManifest.arguments.jvm) {
                args.push(argStr
                    .replaceAll('${library_directory}', this.libPath)
                    .replaceAll('${classpath_separator}', this.constructor.getClasspathSeparator())
                    .replaceAll('${version_name}', this.modManifest.id)
                )
            }
        }

        // Java Arguments
        if(process.platform === 'darwin'){
            args.push('-Xdock:name=CraftGameLauncher')
            args.push('-Xdock:icon=' + path.join(__dirname, '..', '..', 'images', 'minecraft.icns'))
        }
        args.push('-Xmx' + ConfigManager.getMaxRAM(this.server.rawServer.id))
        args.push('-Xms' + ConfigManager.getMinRAM(this.server.rawServer.id))
        args = args.concat(ConfigManager.getJVMOptions(this.server.rawServer.id))

        const newAuthlib = ConfigManager.getDataDirectory()+'/common/libraries/net/authlib/authlib-injector/undefined/authlib-injector-undefined.jar'
        const oldAuthlib = ConfigManager.getDataDirectory()+'/common/libraries/net/authlib/authlib-injector-1.2.5/undefined/authlib-injector-1.2.5-undefined.jar';
        [oldAuthlib, newAuthlib].some((e) => {
            if (!fs.existsSync(e)) {
                return false
            }

            args.push('-javaagent:'+e+'='+AUTHLIB_INJECTOR)

            return true
        })

        args.push('-Dminecraft.api.env=custom')
        args.push('-Dminecraft.api.auth.host='+AUTHLIB_INJECTOR+'/authserver')
        args.push('-Dminecraft.api.account.host='+AUTHLIB_INJECTOR+'/api')
        args.push('-Dminecraft.api.session.host='+AUTHLIB_INJECTOR+'/sessionserver')
        args.push('-Dminecraft.api.services.host='+AUTHLIB_INJECTOR+'/minecraftservices')

        // Main Java Class
        args.push(this.modManifest.mainClass)

        // Vanilla Arguments
        args = args.concat(this.vanillaManifest.arguments.game)

        for(let i=0; i<args.length; i++){
            if(typeof args[i] === 'object' && args[i].rules != null){

                let checksum = 0
                for(let rule of args[i].rules){
                    if(rule.os != null){
                        if(rule.os.name === getMojangOS()
                            && (rule.os.version == null || new RegExp(rule.os.version).test(os.release))){
                            if(rule.action === 'allow'){
                                checksum++
                            }
                        } else {
                            if(rule.action === 'disallow'){
                                checksum++
                            }
                        }
                    } else if(rule.features != null){
                        // We don't have many 'features' in the index at the moment.
                        // This should be fine for a while.
                        if(rule.features.has_custom_resolution != null && rule.features.has_custom_resolution === true){
                            if(ConfigManager.getFullscreen()){
                                args[i].value = [
                                    '--fullscreen',
                                    'true'
                                ]
                            }
                            checksum++
                        }
                    }
                }

                // TODO splice not push
                if(checksum === args[i].rules.length){
                    if(typeof args[i].value === 'string'){
                        args[i] = args[i].value
                    } else if(typeof args[i].value === 'object'){
                        //args = args.concat(args[i].value)
                        args.splice(i, 1, ...args[i].value)
                    }

                    // Decrement i to reprocess the resolved value
                    i--
                } else {
                    args[i] = null
                }

            } else if(typeof args[i] === 'string'){
                if(argDiscovery.test(args[i])){
                    const identifier = args[i].match(argDiscovery)[1]
                    let val = null
                    switch(identifier){
                        case 'auth_player_name':
                            val = this.authUser.displayName.trim()
                            break
                        case 'version_name':
                            //val = vanillaManifest.id
                            val = this.server.rawServer.id
                            break
                        case 'game_directory':
                            val = this.gameDir
                            break
                        case 'assets_root':
                            val = path.join(this.commonDir, 'assets')
                            break
                        case 'assets_index_name':
                            val = this.vanillaManifest.assets
                            break
                        case 'auth_uuid':
                            val = this.authUser.uuid.trim()
                            break
                        case 'auth_access_token':
                            val = this.authUser.accessToken
                            break
                        case 'user_type':
                            val = this.authUser.type === 'microsoft' ? 'msa' : 'mojang'
                            break
                        case 'version_type':
                            val = this.vanillaManifest.type
                            break
                        case 'resolution_width':
                            val = ConfigManager.getGameWidth()
                            break
                        case 'resolution_height':
                            val = ConfigManager.getGameHeight()
                            break
                        case 'natives_directory': {
                            if(args[i].startsWith('-Djava.library.path=')){
                                const token = args[i].match(argDiscovery)[0]
                                const suffix = args[i].substring(args[i].indexOf(token) + token.length)
                                nativesExtractPath = path.join(tempNativePath, suffix)
                            }
                            val = args[i].replace(argDiscovery, tempNativePath)
                            break
                        }
                        case 'launcher_name':
                            val = args[i].replace(argDiscovery, 'CraftGameLauncher')
                            break
                        case 'launcher_version':
                            val = args[i].replace(argDiscovery, this.launcherVersion)
                            break
                        case 'classpath':
                            val = this.classpathArg(mods, tempNativePath, nativesExtractPath).join(this.constructor.getClasspathSeparator())
                            break
                    }
                    if(val != null){
                        args[i] = val
                    }
                }
            }
        }

        // Autoconnect
        this._processAutoConnectArg(args)


        // Forge Specific Arguments
        args = args.concat(this.modManifest.arguments.game)

        // Filter null values
        args = args.filter(arg => {
            if(arg == null) return false
            if(typeof arg !== 'string') return true
            // Minecraft 26.1 manifest adds --sun-misc-unsafe-memory-access=allow for Java 22+,
            // but older Java versions reject it. Filter it out for compatibility.
            if(arg.startsWith('--sun-misc-')) return false
            return true
        })

        return args
    },

    /**
     * Resolve the arguments required by forge.
     *
     * @returns {Array.<string>} An array containing the arguments required by forge.
     */
    _resolveForgeArgs(){
        const mcArgs = this.modManifest.minecraftArguments.split(' ')
        const argDiscovery = /\${*(.*)}/

        // Replace the declared variables with their proper values.
        for(let i=0; i<mcArgs.length; ++i){
            if(argDiscovery.test(mcArgs[i])){
                const identifier = mcArgs[i].match(argDiscovery)[1]
                let val = null
                switch(identifier){
                    case 'auth_player_name':
                        val = this.authUser.displayName.trim()
                        break
                    case 'version_name':
                        //val = vanillaManifest.id
                        val = this.server.rawServer.id
                        break
                    case 'game_directory':
                        val = this.gameDir
                        break
                    case 'assets_root':
                        val = path.join(this.commonDir, 'assets')
                        break
                    case 'assets_index_name':
                        val = this.vanillaManifest.assets
                        break
                    case 'auth_uuid':
                        val = this.authUser.uuid.trim()
                        break
                    case 'auth_access_token':
                        val = this.authUser.accessToken
                        break
                    case 'user_type':
                        val = this.authUser.type === 'microsoft' ? 'msa' : 'mojang'
                        break
                    case 'user_properties': // 1.8.9 and below.
                        val = '{}'
                        break
                    case 'version_type':
                        val = this.vanillaManifest.type
                        break
                }
                if(val != null){
                    mcArgs[i] = val
                }
            }
        }

        // Autoconnect to the selected server.
        this._processAutoConnectArg(mcArgs)

        // Prepare game resolution
        if(ConfigManager.getFullscreen()){
            mcArgs.push('--fullscreen')
            mcArgs.push(true)
        } else {
            mcArgs.push('--width')
            mcArgs.push(ConfigManager.getGameWidth())
            mcArgs.push('--height')
            mcArgs.push(ConfigManager.getGameHeight())
        }

        // Mod List File Argument
        mcArgs.push('--modListFile')
        if(this._lteMinorVersion(9)) {
            mcArgs.push(path.basename(this.fmlDir))
        } else {
            mcArgs.push('absolute:' + this.fmlDir)
        }


        // LiteLoader
        if(this.usingLiteLoader){
            mcArgs.push('--modRepo')
            mcArgs.push(this.llDir)

            // Set first arg to liteloader tweak class
            mcArgs.unshift('com.mumfrey.liteloader.launch.LiteLoaderTweaker')
            mcArgs.unshift('--tweakClass')
        }

        return mcArgs
    },

    _processAutoConnectArg(args){
        if(ConfigManager.getAutoConnect() && this.server.rawServer.autoconnect){
            if(mcVersionAtLeast('1.20', this.server.rawServer.minecraftVersion)){
                args.push('--quickPlayMultiplayer')
                args.push(`${this.server.hostname}:${this.server.port}`)
            } else {
                args.push('--server')
                args.push(this.server.hostname)
                args.push('--port')
                args.push(this.server.port)
            }
        }
    }

}
