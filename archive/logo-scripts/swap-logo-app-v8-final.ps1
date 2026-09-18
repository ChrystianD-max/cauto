$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$utf8=New-Object System.Text.UTF8Encoding($false)

# source : le PNG fourni
$src='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\icons\logo-app.png'
if(-not(Test-Path -LiteralPath $src)){
  throw 'logo-app.png absente - relancer la copie'
}
# --- inspecte le vrai header de index.html pour cibler exactement ---
$idx=Join-Path $www 'index.html'
$t=[IO.File]::ReadAllText($idx)
$m=[regex]::Match($t,'<svg id="i-logo-sprite"[^>]*>.*?</svg>',[Text.RegularExpressions.RegexOptions]::Singleline)
if($m.Success){
  'symbol sprite trouve'
}else{
  $m2=[regex]::Match($t,'<svg style="display:none"[^>]*>.*?</svg>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($m2.Success){ 'sprite sans id trouve (display:none)' } else { 'PAS de sprite detecte' }
}
# --- header : le <a class="nav-logo"> contient <svg viewBox="0 0 100 100">...i-logo...</svg> ---
$m=[regex]::Match($t,'<a\b[^>]*\bclass="[^"]*nav-logo[^"]*"[^>]*>.*?</a>',[Text.RegularExpressions.RegexOptions]::Singleline)
if($m.Success){
  '--- nav-logo (header) ---'
  $m.Value.Substring(0,[Math]::Min(220,$m.Value.Length)).Replace("`n",' ')
  ''
}

# --- remplace les <use href="#i-logo"/> + xlink dans index.html ---
$t=[regex]::Replace($t,'<use\b[^>]*\bhref="#i-logo"[^/]*/>','<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:22%" />',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
$t=[regex]::Replace($t,'<use\b[^>]*\bxlink:href="#i-logo"[^/]*/>','<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:22%" />',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
[IO.File]::WriteAllText($idx,$t,$utf8)
'index.html : <use href="#i-logo"> -> <img logo-app.png>'

# --- meme chose pour les autres .html du www ---
$n=0
Get-ChildItem -Path $www -Filter '*.html' -File | Where-Object { $_.Name -ne 'index.html' } | ForEach-Object {
  $p=$_.FullName
  $c=[IO.File]::ReadAllText($p)
  $o=$c
  $c=[regex]::Replace($c,'<use\b[^>]*\bhref="#i-logo"[^/]*/>','<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:22%" />',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $c=[regex]::Replace($c,'<use\b[^>]*\bxlink:href="#i-logo"[^/]*/>','<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:22%" />',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($c -ne $o){ [IO.File]::WriteAllText($p,$c,$utf8); $n++; '  '+$_.Name }
}
"autres html : $n modifie(s)"
'TERMINE'