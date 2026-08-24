@echo off
setlocal
set "PATH=C:\Windows\System32\WindowsPowerShell\v1.0;C:\Windows\System32;C:\Windows;C:\Program Files\Git\bin;C:\Program Files (x86)\Common Files\Oracle\Java\java8path;C:\Program Files (x86)\Common Files\Oracle\Java\javapath;C:\Program Files\YunShu\utils;C:\Users\ASUS\AppData\Roaming\npm;C:\Program Files\Docker\Docker\resources\bin;E:\Git\cmd;C:\Program Files\nodejs\;C:\Program Files\Go\bin;D:\Xshell\;C:\Program Files\NVIDIA Corporation\NVIDIA App\NvDLISR;D:\phpstudy_pro\Extensions\php\php7.3.4nts;C:\composer;C:\Users\ASUS\AppData\Local\Microsoft\WindowsApps;"
set "CONFIG=%~1"
set TrackFileAccess=false
if "%CONFIG%"=="" set CONFIG=debug
call "E:\flutter\bin\flutter.bat" build windows --%CONFIG% --no-pub
exit /b %errorlevel%
