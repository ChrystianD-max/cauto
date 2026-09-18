$ErrorActionPreference='Continue'
'=== 1) fichier fourni confirme (source fiable) ==='
Add-Type -AssemblyName System.Drawing
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  'CHEMIN NON TROUVE — recherche par nom :'
  $hit=Get-ChildItem -Path 'C:\Users\utilisateur' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($hit){ $src=$hit.FullName; 'retrouve : '+$src } else { 'INTROUVABLE.' }
}
if(Test-Path -LiteralPath $src){
  $b=[IO.File]::ReadAllBytes($src)
  $ok=($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)
  $w=($b[16]-shl 24)+($b[17]-shl 16)+($b[18]-shl 8)+$b[19]
  $h=($b[20]-shl 24)+($b[21]-shl 16)+($b[22]-shl 8)+$b[23]
  'FICHIER : '+$src
  '  PNG valide : '+$ok+'   dimensions : '+$w+'x'+$h+'  ('+$b.Length+' B)'
}

'=== 2) ou le "logo" est-il reference dans le frontend ? ==='
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
if(-not(Test-Path -LiteralPath $www)){ $www='C:\Users\utilisateur\Documents\Default Project\frontend\www' }
$cibles=@(
  'manis.html','sw.js','manifest.json','views-cauto-v8.js','views-professionals-v8.js',
  'views-modules-v2.js','app-v8.js','styles.css','index.html'
)
$mots=@('i-logo','logo-url','logoUrl','logo_professionals','logo-pro','logoDocId','logo_url','app_logo','APP_LOGO','src="app/icons','icons/icon-512','logo.svg','<logo>')

foreach($f in $cibles){
  $p=Join-Path $www $f
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $c=Get-Content -LiteralPath $p -Raw
  $trouve=@()
  foreach($m in $mots){
    if($c.IndexOf($m,[StringComparison]::OrdinalIgnoreCase) -ge 0){ $trouve += $m }
  }
  $aff='-'
  if($trouve.Count){ $aff = $trouve -join ', ' }
  '{0,-26} : {1}' -f $f, $aff
}
'FIN'