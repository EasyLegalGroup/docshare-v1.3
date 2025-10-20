# Deploy Lambda with Journal Selection Feature
# Run from: C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\vscode attempt

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " Deploying Journal Selection Feature" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 1. Remove old zip
Write-Host "[1/4] Removing old lambda.zip..." -ForegroundColor Yellow
if (Test-Path "lambda.zip") {
    Remove-Item "lambda.zip" -Force
    Write-Host "  ✓ Removed old zip" -ForegroundColor Green
}

# 2. Create new zip
Write-Host "[2/4] Creating lambda.zip..." -ForegroundColor Yellow
Compress-Archive -Path "lambda.py" -DestinationPath "lambda.zip" -Force
Write-Host "  ✓ Created lambda.zip ($(((Get-Item lambda.zip).Length / 1KB).ToString('F2')) KB)" -ForegroundColor Green

# 3. Upload to AWS Lambda
Write-Host "[3/4] Uploading to AWS Lambda (dfj-docshare-test)..." -ForegroundColor Yellow
try {
    $result = aws lambda update-function-code `
        --function-name dfj-docshare-test `
        --zip-file fileb://lambda.zip `
        --region eu-north-1 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Uploaded to Lambda" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Upload failed: $result" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ✗ Error: $_" -ForegroundColor Red
    exit 1
}

# 4. Wait for Lambda to be ready
Write-Host "[4/4] Waiting for Lambda to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "  ✓ Lambda ready" -ForegroundColor Green

# 5. Test deployment
Write-Host ""
Write-Host "Testing deployment..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/ping" -Method Get
    if ($response.ok -eq $true) {
        Write-Host "  ✓ Ping successful: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Unexpected response: $($response | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Test failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Refresh your browser at http://localhost:5173" -ForegroundColor White
Write-Host "2. Test with phone: +4542455150" -ForegroundColor White
Write-Host "3. If multiple journals exist, you'll see the bridge page" -ForegroundColor White
Write-Host ""
