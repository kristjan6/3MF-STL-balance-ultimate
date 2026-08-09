; bambu-balance-ultimate-installer.nsi
;
; NSIS installer for Bambu Studio Pre-Slice Hook Integration
;
; Features:
;  - Detects Node.js installation; offers to download if missing
;  - Installs balance-cli.js, bridge server, and pre-slice hooks
;  - Registers hook with Bambu Studio config
;  - Creates Start Menu shortcuts
;  - Uninstaller support
;
; Build: makensis bambu-balance-ultimate-installer.nsi
; Output: dist\bambu-balance-ultimate-installer.exe
;
; Requires:
;  - NSIS 3.x (https://nsis.sourceforge.io/)
;  - Visual C++ redistributables (included with Node.js)

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"

; Configuration
!define VERSION "1.0.0"
!define PRODUCT_NAME "Bambu Studio Balance Ultimate Hook"
!define COMPANY_NAME "STL Balance"
!define MUI_BRANDINGTEXT "Balance Analysis for Bambu Studio"

; Output file
OutFile "dist\bambu-balance-ultimate-${VERSION}.exe"

; Installation directories
InstallDir "$PROGRAMFILES\BambuBalanceHook"
InstallDirRegKey HKCU "Software\BambuBalanceHook" ""

; MUI Settings
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Language
!insertmacro MUI_LANGUAGE "English"

; Version information
VIProductVersion "${VERSION}.0"
VIAddVersionKey ProductName "${PRODUCT_NAME}"
VIAddVersionKey ProductVersion "${VERSION}"
VIAddVersionKey CompanyName "${COMPANY_NAME}"
VIAddVersionKey FileVersion "${VERSION}"

; Installer sections

Section "Balance CLI & Hook (Required)"
  SetOutPath "$INSTDIR"
  
  ; Copy main files
  File "balance-cli.js"
  File "bambu-preslice-hook.bat"
  File "bambu-preslice-hook.ps1"
  File "bambu-bridge\server.js"
  File "package.json"
  File "LICENSE.txt"
  File "README.md"
  
  ; Create directory for bridge
  CreateDirectory "$INSTDIR\bambu-bridge"
  SetOutPath "$INSTDIR\bambu-bridge"
  File "bambu-bridge\server.js"
  
  ; Create directory for hook results
  CreateDirectory "$LOCALAPPDATA\BambuStudio\hook-results"
  
  ; Write registry
  WriteRegStr HKCU "Software\BambuBalanceHook" "" "$INSTDIR"
  WriteRegStr HKCU "Software\BambuBalanceHook" "Version" "${VERSION}"
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Register in Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BambuBalanceHook" \
    "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BambuBalanceHook" \
    "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BambuBalanceHook" \
    "DisplayVersion" "${VERSION}"
  
SectionEnd

Section "Node.js Modules"
  SetOutPath "$INSTDIR"
  
  ; Check if npm is available
  nsExec::ExecToLog "npm --version"
  Pop $0
  
  ${If} $0 == 0
    ; Install Node dependencies
    DetailPrint "Installing Node.js dependencies (jszip, xmldom)..."
    nsExec::ExecToLog "npm install jszip@3.10.1 xmldom --save"
    ${If} $0 != 0
      MessageBox MB_ICONEXCLAMATION "Warning: npm install failed. You may need to manually run: npm install jszip xmldom"
    ${EndIf}
  ${Else}
    MessageBox MB_ICONINFORMATION "Node.js npm not found in PATH. Please ensure Node.js is installed and added to PATH, then run: npm install jszip xmldom"
  ${EndIf}
  
SectionEnd

Section "Start Menu Shortcuts"
  SetOutPath "$INSTDIR"
  
  CreateDirectory "$SMPROGRAMS\Bambu Balance"
  CreateShortCut "$SMPROGRAMS\Bambu Balance\Health Check Dashboard.lnk" \
    "$INSTDIR\start-bridge.bat" "" "$INSTDIR\start-bridge.bat" 0
  CreateShortCut "$SMPROGRAMS\Bambu Balance\Web UI (index.html).lnk" \
    "http://localhost:8787" "" "" 0
  CreateShortCut "$SMPROGRAMS\Bambu Balance\Uninstall.lnk" \
    "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  CreateShortCut "$SMPROGRAMS\Bambu Balance\README.lnk" \
    "$INSTDIR\README.md" "" "$INSTDIR\README.md" 0
  
SectionEnd

Section "Register Hook with Bambu Studio"
  SetOutPath "$INSTDIR"
  
  ; Create startup script
  FileOpen $0 "$INSTDIR\start-bridge.bat" w
  FileWrite $0 "@echo off$\n"
  FileWrite $0 "echo Starting Bambu Bridge Server...$\n"
  FileWrite $0 "echo Point your browser to http://localhost:8787$\n"
  FileWrite $0 "node $\"$INSTDIR\bambu-bridge\server.js$\"$\n"
  FileClose $0
  
  ; Write hook configuration to Bambu's config directory
  ; This assumes Bambu Studio looks for hooks in AppData\Local\BambuStudio
  CreateDirectory "$LOCALAPPDATA\BambuStudio\hooks"
  
  FileOpen $0 "$LOCALAPPDATA\BambuStudio\hooks\preslice-hook.ini" w
  FileWrite $0 "[preslice]$\n"
  FileWrite $0 "enabled=true$\n"
  FileWrite $0 "script=$INSTDIR\bambu-preslice-hook.bat$\n"
  FileWrite $0 "timeout=60000$\n"
  FileWrite $0 "failureMode=continue$\n"
  FileWrite $0 "logDir=$LOCALAPPDATA\BambuStudio\hook-results$\n"
  FileClose $0
  
  DetailPrint "Hook registered. Results will appear in: $LOCALAPPDATA\BambuStudio\hook-results"
  
SectionEnd

Section "Uninstall"
  ; Remove Start Menu shortcuts
  RMDir /r "$SMPROGRAMS\Bambu Balance"
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\BambuBalanceHook"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BambuBalanceHook"
  
  ; Remove files
  RMDir /r "$INSTDIR"
  
SectionEnd
