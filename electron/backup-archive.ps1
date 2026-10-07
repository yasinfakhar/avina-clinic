$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = $env:AVINA_ARCHIVE_SOURCE
$destination = $env:AVINA_ARCHIVE_DESTINATION
if ($env:AVINA_ARCHIVE_ACTION -eq 'create') {
    $items = @(Get-ChildItem -LiteralPath $source -Recurse -Force)
    $links = $items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
    if ($links) { throw 'Linked files cannot be backed up.' }
    $size = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum
    if ($items.Count -gt 99999 -or $size -gt 20GB) { throw 'Backup exceeds the 20 GB or 100000 entry limit.' }
    [IO.Compression.ZipFile]::CreateFromDirectory($source, $destination, [IO.Compression.CompressionLevel]::Optimal, $true)
} else {
    $archive = [IO.Compression.ZipFile]::OpenRead($source)
    try {
        $root = [IO.Path]::GetFullPath($destination).TrimEnd('\') + '\'
        $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        [long]$total = 0
        if ($archive.Entries.Count -gt 100000) { throw 'Too many archive entries.' }
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\', '/')
            $parts = $name.TrimEnd('/').Split('/')
            if ($parts[0] -ne 'data' -or $name.StartsWith('/') -or $name.Contains(':')) { throw 'Invalid backup layout.' }
            foreach ($part in $parts) {
                if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>"|?*\x00-\x1f]' -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)') { throw 'Unsafe archive path.' }
            }
            if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Archive links are not allowed.' }
            $target = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $name.Replace('/', '\')))
            if (!$target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or !$names.Add($target)) { throw 'Duplicate or unsafe archive path.' }
            $total += $entry.Length
            if ($total -gt 20GB) { throw 'Backup exceeds the 20 GB extraction limit.' }
        }
        foreach ($entry in $archive.Entries) {
            $target = [IO.Path]::Combine($root, $entry.FullName.Replace('/', '\'))
            if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) {
                [IO.Directory]::CreateDirectory($target) | Out-Null
            } else {
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
            }
        }
    } finally { $archive.Dispose() }
}
