$ErrorActionPreference='Continue'
Add-Type -AssemblyName System.Drawing

$base='C:\Users\utilisateur\Documents\Default Project'
$www=Join-Path $base 'frontend\www'
$app=Join-Path $www 'app'

'=== 1) le logo affiche dans le header — quelle balise, dans quels fichiers ==='
$needles=@('i-logo','class="logo"',"class='logo'",'logo-img','<img','<h1','brand','logo_url','logoUrl','logo-doc')
$found=@()
foreach($f in @('app\app-v8.js','app\index.html','app\views-professionals-v8.js','app\views-modules-v2.js','app\views-clients-v8.js','app\manifest.json','app\styles.css','index.html')){
  $p=Join-Path $www $f
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $c=Get-Content -LiteralPath $p -Raw
  foreach($n in $needles){
    if($c.IndexOf($n,[StringComparison]::OrdinalIgnoreCase) -ge 0){
      $found += ('{0}  [{1}]' -f $f,$n)
    }
  }
}
$found | ForEach-Object { '  '+$_ }

'=== 2) extraits contenant le logo (contexte) ==='
foreach($f in @('app\app-v8.js','app\index.html','app\views-professionals-v8.js')){
  $p=Join-Path $www $f
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $lines=Get-Content -LiteralPath $p
  for($i=0;$i -lt $lines.Count;$i++){
    if($lines[$i] -match 'i-logo|class="logo"|logo_url|logoUrl'){
      '  [{0}:{1}] {2}' -f $f,($i+1),($lines[$i].Trim())
    }
  }
}

'=== 3) logo-doc : la page de reception l affiche-t-elle via un document serve ? ==='
foreach($pat in @('logo_doc_id','logoDocId','document.logo','logo_id')){
  $hits=@()
  Get-ChildItem -LiteralPath $app -File | ForEach-Object {
    $c=Get-Content -LiteralPath $_.FullName -Raw
    if($c.IndexOf($pat,[StringComparison]::OrdinalIgnoreCase) -ge 0){ $hits+=$_.Name }
  }
  if($hits){ '{0,-16} : {1}' -f $pat,($hits -join ', ') } else { '{0,-16} : -' -f $pat }
}
'FIN'