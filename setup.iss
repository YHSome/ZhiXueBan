; 知学伴 Windows 安装程序
[Setup]
AppName=知学伴
AppVersion=1.0
DefaultDirName={autopf}\知学伴
DefaultGroupName=知学伴
OutputDir=release
OutputBaseFilename=知学伴Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=知学伴

[Files]
Source: "release\知学伴\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\知学伴"; Filename: "{app}\知学伴.exe"
Name: "{commondesktop}\知学伴"; Filename: "{app}\知学伴.exe"

[Run]
Filename: "{app}\知学伴.exe"; Description: "启动知学伴"; Flags: nowait postinstall skipifsilent
