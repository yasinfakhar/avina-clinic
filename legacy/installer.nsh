!include "LogicLib.nsh"
!include "WinVer.nsh"
!macro customInit
  ${IfNot} ${AtLeastWin7}
    MessageBox MB_ICONSTOP "Avina requires Windows 7 SP1 x64 or newer."
    Abort
  ${EndIf}
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} $0 < 528040
    MessageBox MB_ICONSTOP "Install Microsoft .NET Framework 4.8 before installing Avina (required for backup and restore)."
    Abort
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine" "PowerShellVersion"
  StrCpy $1 $0 3
  ${If} $1 != "5.1"
    MessageBox MB_ICONSTOP "Install Windows Management Framework 5.1 before installing Avina (required for backup and restore)."
    Abort
  ${EndIf}
!macroend
