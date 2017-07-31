cd ../.backupJPGs

%IMGK%/mogrify -quality 90 -format jpg *.png
%IMGK%/mogrify -quality 70 -format jpg *300x600*.png
%IMGK%/mogrify -quality 75 -format jpg *970x250*.png

pause