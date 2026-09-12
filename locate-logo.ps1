$base='C:\Users\utilisateur\Documents\Default Project'
$www=Join-Path $base 'frontend\www'
$app=Join-Path $www 'app'

'=== 1) FICHIER LOGO FOURNI — valide ? (System.Drawing, source fiable) ==='
Add-Type -AssemblyName System.Drawing
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  'INTROUVABLE : '+$src
} else {
  $im=[System.Drawing.Image]::FromFile($src)
  '  OK  {0}x{1}  PNG : {2}' -f $im.Width,$im.Height,($im.RawFormat.Guid -eq [System.Drawing.Imaging.ImageFormat]::Png.Guid)
  $im.Dispose()
}

'=== 2) Où le LOGO est-il affiché dans le frontend ? ==='
'--- 2a) références 'i-logo' (sprite SVG déjà lu dans index.html / app-v8.js) ---'
$needles=@('i-logo','logo-cauto','logo-app','<svg','manifest.json','apple-touch-icon','maskable','icon-512','icon-192')
foreach($rel in @('app\index.html','app\app-v8.js','app\views-professionals-v8.js','app\views-modules-v2.js','app\sw.js','index.html','app\manifest.json')){
  $p=Join-Path $www $rel
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $c=Get-Content -LiteralPath $p -Raw
  $hits=@()
  foreach($n in $needles){
    if($c.IndexOf($n,[StringComparison]::OrdinalIgnoreCase) -ge 0){ $hits+=$n }
  }
  if($hits.Count){ '  {0,-34} : {1}' -f $rel,($hits -join ', ') }
}

'--- 2b) le <head> de index.html (acion: favicon/logo référencés ?) ---'
$idx=Join-Path $www 'app\index.html'
if(Test-Path -LiteralPath $idx){
  $c=Get-Content -LiteralPath $idx -Raw
  $i=$c.IndexOf('<head>')
  if($i -ge 0){
    $head=$c.Substring($i,[Math]::Min(700,$c.Length-$i))
    '  --- extrait <head> (700 car) ---'
    ($head -split "`n") | ForEach-Object { '    '+$_ }
  } else { '  <head> non trouvé !' }
}
'=== 3) sw.js / service worker : version + façon dont il précache les icônes ==='
$sw=Join-Path $app 'sw.js'
if(Test-Path -LiteralPath $sw){
  $c=Get-Content -LiteralPath $sw -Raw
  $mv=[regex]::Match($c,'cauto-pwa-v(\d+)')
  '  VERSION sw : ' + $(if($mv.Success){ 'cauto-pwa-v'+$mv.Groups[1].Value } else { 'NON TROUVE' })
  '  CORE (icônes précachées) : '
  foreach($line in ($c -split "`n")){
    if($line -match "'\./icons/|\./icons/icon-|maskable|apple-touch"){ '    '+$line.Trim() }
  }
} else { '  sw.js ABSENT : '+$sw }
'FIN'