$ErrorActionPreference='SilentlyContinue'
$rep='C:\Users\utilisateur\Documents\Default Project'
$api='https://api.github.com/repos/ChrystianD-max/cauto/actions/runs/34902607824'
try {
  $r=Invoke-RestMethod -Uri $api -Headers @{Accept='application/vnd.github.v3+json'}
  'RUN #' + $r.id + ' | ' + $r.conclusion + ' | head: ' + $r.head_sha.Substring(0,11)
  'JOBS:'
  foreach($j in $r.jobs){
    '  - ' + $j.name + ': ' + $j.status + '/' + $j.conclusion
    if($j.conclusion -eq 'failure'){
      '    -> ERREUR DANS CE JOB'
      $jd=Invoke-RestMethod -Uri $j.url -Headers @{Accept='application/vnd.github.v3+json'}
      foreach($s in $jd.summary_steps){
        '      STEP: ' + $s.name
        if($s.exit_code -ne $null){ '        exit_code: ' + $s.exit_code }
      }
    }
  }
} catch {
  'ERREUR: ' + $_.Exception.Message
}
