
; NSIS installer script for Bambu Balance Ultimate

Name "Bambu Balance Ultimate"

OutFile "bambu-balance-ultimate-setup.exe"

InstallDir "$PROGRAMFILES\BambuBalanceUltimate"

RequestExecutionLevel admin


Page directory

Page instfiles


Section "Install"

SetOutPath "$INSTDIR"

File /r "staging\*.*"

CreateDirectory "$SMPROGRAMS\Bambu Balance Ultimate"

CreateShortCut "$SMPROGRAMS\Bambu Balance Ultimate\Bambu Balance Ultimate.lnk" "$INSTDIR\\index.html" "" "$INSTDIR"

WriteRegStr HKLM "Software\BambuBalanceUltimate" "InstallDir" "$INSTDIR"

SectionEnd


Section "Uninstall"

Delete "$SMPROGRAMS\Bambu Balance Ultimate\Bambu Balance Ultimate.lnk"

RMDir /r "$INSTDIR"

DeleteRegKey HKLM "Software\BambuBalanceUltimate"

SectionEnd

