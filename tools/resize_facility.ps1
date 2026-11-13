param([string]$Source, [string]$Output, [int]$Width, [int]$Height, [switch]$Smooth)
# 생성 이미지를 게임용 도트 해상도로 정규화한다. 원본 생성 파일은 보존.
Add-Type -AssemblyName System.Drawing
$inputImage = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Source).Path)
$left=$inputImage.Width; $top=$inputImage.Height; $right=0; $bottom=0
for($y=0;$y -lt $inputImage.Height;$y++){
 for($x=0;$x -lt $inputImage.Width;$x++){
  if($inputImage.GetPixel($x,$y).A -gt 128){
   $left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x)
   $top=[Math]::Min($top,$y);$bottom=[Math]::Max($bottom,$y)
  }
 }
}
$resultImage=[System.Drawing.Bitmap]::new($Width,$Height)
$graphics=[System.Drawing.Graphics]::FromImage($resultImage)
$graphics.InterpolationMode=if($Smooth){[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic}else{[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor}
$graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
$graphics.DrawImage($inputImage,[System.Drawing.Rectangle]::new(0,0,$Width,$Height),$left,$top,($right-$left+1),($bottom-$top+1),[System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose();$inputImage.Dispose()
$resultImage.Save([IO.Path]::GetFullPath($Output),[System.Drawing.Imaging.ImageFormat]::Png)
$resultImage.Dispose()
