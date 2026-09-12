$ErrorActionPreference="Stop"
$www="C:\Users\utilisateur\Documents\Default Project\frontend\www"

# source PNG (verifiee 1254x1254)
$src="C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png"
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path "C:\Users\utilisateur\OneDrive" -Filter "file_00000000739881f4bee32c4acd4e89b7.png" -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw "PNG introuvable" }
}

# copie vers app/icons/logo-app.png
$ic=Join-Path $www "app\icons"
if(-not(Test-Path -LiteralPath $ic)){ New-Item -ItemType Directory -Path $ic -Force | Out-Null }
$target=Join-Path $ic "logo-app.png"
Copy-Item -LiteralPath $src -Destination $target -Force
"COPIE : $target"

# verifie dimensions system drawing
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile($target)
"TAILLE : $($img.Width)x$($img.Height)"
$img.Dispose()

$utf8=New-Object System.Text.UTF8Encoding($false)
$resolved=(Resolve-Path -LiteralPath (Split-Path $target)).Path + "\logo-app.png"
"RESOLVED: $resolved"
"FIN"