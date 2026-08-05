<#
bambu-autobalance-wrapper.ps1
Wrapper to run Bambu CLI (or any slicer CLI) then run balance-cli.js and optionally recommend infill/preset adjustments.
Usage:
  .\bambu-autobalance-wrapper.ps1 -ModelPath C:\path\to\model.stl -BambuCliPath 'C:\Program Files\Bambu Studio\bambu-studio-console.exe' -Density 1.24 -Threshold 5 -AutoRun

#>
param(
  [Parameter(Mandatory=$true)][string]$ModelPath,
  [string]$BambuCliPath = $env:BAMBU_CLI_PATH,
  [double]$Density = 1.24,
  [double]$Threshold = 5.0,
  [switch]$AutoRun,
  [string]$AdditionalArgs
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if(-not $node){ Write-Error "Node.js not found in PATH. Install Node 18+."; exit 2 }
$cli = Join-Path $scriptDir 'balance-cli.js'
if(-not (Test-Path $cli)){ Write-Error "balance-cli.js not found in $scriptDir"; exit 2 }

# Run analysis
Write-Host "Analyzing model: $ModelPath (density=$Density g/cm3)"
$jsOut = & $node $cli $ModelPath --density $Density --format json 2>&1
if($LASTEXITCODE -ne 0){ Write-Error "balance-cli failed:\n$jsOut"; exit $LASTEXITCODE }
try{ $report = $jsOut | Out-String | ConvertFrom-Json } catch { Write-Error "Failed to parse JSON output:\n$jsOut"; exit 3 }

# Compute offset relative to bbox center
$bboxMin = $report.bbox.min
$bboxMax = $report.bbox.max
$bboxCenter = @{ x = (($bboxMin.x + $bboxMax.x)/2); y = (($bboxMin.y + $bboxMax.y)/2); z = (($bboxMin.z + $bboxMax.z)/2) }
$dx = $report.com_mm.x - $bboxCenter.x
$dy = $report.com_mm.y - $bboxCenter.y
$dz = $report.com_mm.z - $bboxCenter.z
$offset = [math]::Sqrt($dx*$dx + $dy*$dy + $dz*$dz)
Write-Host "COM offset from bbox center: $([math]::Round($offset,3)) mm"

$recommendation = @{ preset = 'general'; reason = '' }
# Determine dominant axis
$abs = @{ x=[math]::Abs($dx); y=[math]::Abs($dy); z=[math]::Abs($dz) }
$dominant = ("x","y","z" | Sort-Object { -$abs[$_] })[0]

# Prepare size and lever
$size = $report.size_mm
$leverAxis = $dominant
# Compute axis size safely (PowerShell doesn't support inline if-expressions portably)
if($leverAxis -eq 'x'){
  $axisSize = [double]$size.x
} elseif($leverAxis -eq 'y'){
  $axisSize = [double]$size.y
} else {
  $axisSize = [double]$size.z
}
$leverLen = [math]::Max($axisSize/2.0, 1.0)
$totalMass = [double]$report.mass_g
$ballastDensity = 7.8 # steel approx
$defaultDensity = $Density
if($leverAxis -eq 'x') { $offsetAlong = $dx } elseif($leverAxis -eq 'y') { $offsetAlong = $dy } else { $offsetAlong = $dz }
if($leverLen -eq 0){ $ballastMass = 0 } else { $ballastMass = [math]::Abs($totalMass * $offsetAlong / $leverLen) }
$ballastVolume = ($ballastMass / $ballastDensity)
$hollowVolume = ($ballastMass / $defaultDensity)

if(($offset) -gt $Threshold){
  if($dominant -eq 'y'){
    $recommendation.preset = 'pivot-part'
    $recommendation.reason = 'Vertical COM drift; consider changing pivot or supports.'
  } else {
    $recommendation.preset = 'low-infill'
    $recommendation.reason = 'Horizontal drift; suggest infill bias or ballast opposite heavy side.'
  }
  Write-Host "Recommendation: $($recommendation.preset) - $($recommendation.reason)"
  Write-Host "Estimated ballast mass: $([math]::Round($ballastMass,3)) g (volume: $([math]::Round($ballastVolume,4)) cm^3)"
} else { Write-Host 'Assembly is near-neutral; no preset adjustments recommended.' }

# Write a recommendation JSON next to the model
$rec = [PSCustomObject]@{
  model = $ModelPath;
  analysis = $report;
  recommendation = @{ preset = $recommendation.preset; reason = $recommendation.reason; ballastMass_g = [math]::Round($ballastMass,4); ballastVolume_cm3 = [math]::Round($ballastVolume,4); hollowVolume_cm3 = [math]::Round($hollowVolume,4); leverAxis = $leverAxis }
}
$recFile = "$ModelPath.balance.json"
$rec | ConvertTo-Json -Depth 6 | Out-File -FilePath $recFile -Encoding UTF8
Write-Host "Wrote recommendation to: $recFile"

if($AutoRun){
  if(-not $BambuCliPath){ Write-Error 'Bambu CLI path not provided. Set -BambuCliPath or BAMBU_CLI_PATH env var.'; exit 4 }
  # Build argument list safely (split AdditionalArgs if provided)
  $argList = @()
  if($AdditionalArgs){ $argList += $AdditionalArgs.Split(' ') }
  $argList += '--preset'
  $argList += $recommendation.preset
  Write-Host "Running Bambu CLI: $BambuCliPath $($argList -join ' ')"
  try {
    $proc = Start-Process -FilePath $BambuCliPath -ArgumentList $argList -NoNewWindow -Wait -PassThru
    if($proc.ExitCode -ne 0){ Write-Error ("Bambu CLI exited with code {0}" -f $proc.ExitCode); exit $proc.ExitCode }
    Write-Host 'Bambu CLI finished successfully.'
  } catch {
      Write-Error ("Failed to run Bambu CLI: {0}" -f $_)
    exit 5
  }
}

# Print the original analysis JSON for capture
$report | ConvertTo-Json -Depth 5 | Write-Output
