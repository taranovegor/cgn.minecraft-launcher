; Migration away from the legacy "cgn-launcher-setup" product name.
;
; Existing installs used productName "cgn-launcher-setup"; electron-builder
; therefore reused the registered install location on upgrades and the app
; kept living in a folder whose name does not match the shortcut any more.
;
; We keep every existing file:
;   - install folder: the old location is left untouched by us; electron-builder
;     uninstalls the previous version normally (removing only app binaries) and
;     installs the new one under "CraftGame Launcher".
;   - config/accounts: %APPDATA%\Minecraft -> %APPDATA%\CraftGame Launcher
;     (renamed by the app itself on first run).
;   - game data (downloads, screenshots, instances) lives in the launcher data
;     directory and is never touched by the installer.

!macro preInit
  ; Force the installer to use the new "CraftGame Launcher" folder instead of
  ; reusing the legacy install location from the registry. The previous version
  ; is still removed by electron-builder's regular uninstall step (it is found
  ; through its uninstall string), so nothing is lost.
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $0 "" cgn_legacy_pre_done
  ; Already migrated: keep the current location.
  StrCpy $1 $0 "" -19
  StrCmp $1 "CraftGame Launcher" cgn_legacy_pre_done
  ; Only migrate an actual launcher install (it contains cgnml.exe).
  IfFileExists "$0\cgnml.exe" 0 cgn_legacy_pre_done
  DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  cgn_legacy_pre_done:
!macroend

!macro customInstall
  ; Remove any leftover legacy shortcuts (desktop / start menu).
  Delete "$DESKTOP\cgn-launcher-setup.lnk"
  Delete "$SMPROGRAMS\cgn-launcher-setup.lnk"
  RMDir "$SMPROGRAMS\cgn-launcher-setup"
!macroend
