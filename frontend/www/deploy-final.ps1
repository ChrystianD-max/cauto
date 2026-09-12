$ErrorActionPreference='Stop'
$token='rnd_SamnOaQAblnWevO0dJF3nmDGnAhe'
$svc  ='srv-dacmhkafngtc73e0ptsg'
$headers=@{ Authorization=('Bearer '+$token) }

'=== 1) etat actuel : dernier event deploys sur Render ==='
$lastDeploys = Invoke-RestMethod -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys?limit=4') -Headers $headers
foreach($d in $lastDeploys){
  '{0}  status={1,-17} commit={2}  cree={3}' -f $d.id,$d.status,$d.commit,($d.createdAt)
}

'=== 2) declenchement deploy explicite sur le DERNIER commit ==='
$git='C:\Users\utilisateur\Documents\Default Project'
$commit=(& git -C $git rev-parse HEAD).Trim()
'Commit cible : '+$commit
$body = @{ commit=$commit } | ConvertTo-Json -Compress
$dep = Invoke-RestMethod -Method Post -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys') -Headers $headers -ContentType 'application/json' -Body $body
'Deploy id : '+$dep.id

'=== 3) poll jusqu a LIVE ==='
$dd=$null; $fin=(Get-Date).AddMinutes(7)
while((Get-Date) -lt $fin){
  Start-Sleep -Seconds 15
  $dd=Invoke-RestMethod -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys/'+$dep.id) -Headers $headers
  '[{0:HH:mm:ss}] {1}' -f (Get-Date),$dd.status
  if($dd.status -eq 'live'){ 'LIVE - deploy actif.'; break }
  if($dd.status -in @('build_failed','deactivated','inactive')){ break }
}
'=== 4) verification finale : logo 512 servi sur Render ==='
Start-Sleep -Seconds 6
try {
  $r=Invoke-RestMethod -Uri ('https://cauto.onrender.com/app/icons/icon-512.png') -Headers $headers
  $len=$r.Length
  $sig=($r[0]-eq 0x89 -and $r[1]-eq 0x50 -and $r[2]-eq 0x4E -and $r[3]-eq 0x47)
  'icon-512 servi : '+$len+' B  PNG='+$sig
} catch { 'verif logo : '+$_.Exception.Message }
'FIN'