; The 1.0.4 all-users uninstall entry can have an empty InstallLocation.
; electron-builder's default process check treats an empty $INSTDIR as a
; prefix of every executable path and incorrectly reports that the app is
; still running. Limit shutdown to the actual application executable.
!macro customCheckAppRunning
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 500
!macroend
