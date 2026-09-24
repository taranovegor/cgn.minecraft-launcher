const loginOptionsCancelContainer = document.getElementById('loginOptionCancelContainer')
const loginOptionWebsite = document.getElementById('loginOptionWebsite')
const loginOptionsCancelButton = document.getElementById('loginOptionCancelButton')

const { WEBSITE_AUTH } = require('./assets/js/endpoints')

let loginOptionsViewOnLoginSuccess
let loginOptionsViewOnLoginCancel
let loginOptionsViewOnCancel
let loginOptionsViewCancelHandler

function loginOptionsCancelEnabled(val){
    if(val){
        dom.show(loginOptionsCancelContainer)
    } else {
        dom.hide(loginOptionsCancelContainer)
    }
}

loginOptionWebsite.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        shell.openExternal(WEBSITE_AUTH)
    })
}

loginOptionsCancelButton.onclick = (e) => {
    switchView(getCurrentView(), loginOptionsViewOnCancel, 500, 500, () => {
        // Clear login values (Mojang login)
        // No cleanup needed for Microsoft.
        loginUsername.value = ''
        loginPassword.value = ''
        if(loginOptionsViewCancelHandler != null){
            loginOptionsViewCancelHandler()
            loginOptionsViewCancelHandler = null
        }
    })
}
