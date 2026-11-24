@echo off
cd /d "%~dp0"
echo Mise a jour de yt-dlp (YouTube change souvent)...
python -m pip install -U -q "yt-dlp[default]"
python convert_server.py
pause
