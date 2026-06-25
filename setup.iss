; 智学伴 Windows 安装程序
[Setup]
AppName=智学伴
AppVersion=1.0
DefaultDirName={autopf}\智学伴
DefaultGroupName=智学伴
OutputDir=release
OutputBaseFilename=智学伴Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=智学伴

[Files]
Source: "release\智学伴\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\智学伴"; Filename: "{app}\智学伴.exe"
Name: "{commondesktop}\智学伴"; Filename: "{app}\智学伴.exe"

[Run]
Filename: "{app}\智学伴.exe"; Description: "启动智学伴"; Flags: nowait postinstall skipifsilent
