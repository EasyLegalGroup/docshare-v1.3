# Deploy Lambda to AWS
# Run this from PowerShell in the "vscode attempt" folder

Write-Host "🚀 Deploying Lambda to AWS..." -ForegroundColor Cyan

# 1. Create ZIP file
Write-Host "`n📦 Creating lambda.zip..." -ForegroundColor Yellow
if (Test-Path lambda.zip) {
    Remove-Item lambda.zip
}
Compress-Archive -Path lambda.py -DestinationPath lambda.zip -Force
Write-Host "✅ lambda.zip created" -ForegroundColor Green

# 2. Deploy to AWS
Write-Host "`n☁️  Uploading to AWS Lambda..." -ForegroundColor Yellow
aws lambda update-function-code `
    --function-name dfj-docshare-test `
    --zip-file fileb://lambda.zip `
    --region eu-north-1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Lambda deployed successfully!" -ForegroundColor Green
    
    # 3. Wait for Lambda to be ready
    Write-Host "`n⏳ Waiting for Lambda to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # 4. Test health endpoint
    Write-Host "`n🏥 Testing health endpoint..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/ping" -Method Get
    if ($response.ok -eq $true) {
        Write-Host "✅ Lambda is healthy and responding!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Lambda responded but ok=$($response.ok)" -ForegroundColor Yellow
    }
    
    Write-Host "`n✨ Deployment complete! Try your chat again." -ForegroundColor Cyan
} else {
    Write-Host "❌ Deployment failed! Check AWS credentials." -ForegroundColor Red
}
