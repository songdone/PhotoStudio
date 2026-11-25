/** File workflow messages. Each composed notice is translated before joining. */
export const fileEntries = `
PSD import	PSD 导入
PSD export	PSD 导出
Export PSD	导出 PSD
Download PSD	下载 PSD
Open project	打开项目
Photo Studio Project	Photo Studio 项目
Open pages	打开多页图像
Open frames	打开多帧图像
First page only	仅打开第一页
First frame only	仅打开第一帧
All pages as layers	将所有页面作为图层打开
All frames as layers	将所有帧作为图层打开
All frames as a frame animation	将所有帧作为帧动画打开
This PSD uses unsupported masks, effects or compositing. Its saved composite was opened as one raster layer.	此 PSD 包含暂不支持的蒙版、效果或合成方式，已将文件中保存的合成图像作为单个像素图层打开。
Opened the PSD composite as one raster layer.	已将 PSD 中保存的合成图像作为单个像素图层打开。
Text, shapes and embedded objects were opened as raster layers.	文字、形状和嵌入对象已作为像素图层打开。
The complete original file is retained in .photo projects. Download PSD preserves its original layers when the preview is unchanged. After preview edits, save a .photo project or export PNG; File → Download original PSD retrieves the original without those edits.	保存为 .photo 项目可保留完整原文件。未修改预览时，导出 PSD 会保留原始图层。修改预览后，请保存为 .photo 项目或导出为 PNG 以保留更改。选择“文件 → 导出 → 下载原始 PSD”可获取不含预览更改的原文件。
This preview has been edited, but its original PSD layers cannot yet be updated. Save a .photo project or export PNG to keep these edits. File → Download original PSD retrieves the original without preview edits.	此预览已编辑，但暂时无法将更改写回原始 PSD 的图层。请保存为 .photo 项目或导出为 PNG，以保留这些更改。选择“文件 → 导出 → 下载原始 PSD”可获取原文件，其中不包含对预览的更改。
This PSD needs a saved composite image. Re-save the file with a composite image included.	此 PSD 缺少已保存的合成图像。请在原编辑软件中启用合成图像或最大化兼容性后重新保存。
PSD layer pixels are missing. Re-save the file with its layer pixel data and a composite image included.	此 PSD 缺少图层像素数据。请在原编辑软件中保留图层像素数据和合成图像后重新保存。
PSD exceeds 512 MB.	PSD 文件超过 512 MB。
PSD exceeds the 512 MB decoded pixel budget.	PSD 解码后的像素数据超过 512 MB 内存限制。
Too many nested PSD groups.	PSD 的图层组嵌套过深。
PSD auxiliary layer channels are not yet supported.	暂不支持 PSD 图层的辅助通道。
Missing embedded pattern metadata.	缺少嵌入图案的元数据。
Unsupported image format.	不支持此图像格式。
This image exceeds the 24 megapixel or 16384 pixel limit.	图像超过 2400 万像素或单边 16384 像素的限制。
Open a PNG, JPEG, WebP, AVIF, GIF, BMP, TIFF, ICO, TGA, Netpbm, SVG, PSD, PSB or .photo file.	请选择 PNG、JPEG、WebP、AVIF、GIF、BMP、TIFF、ICO、TGA、Netpbm、SVG、PSD、PSB 或 .photo 文件。
Import a PNG, JPEG, WebP, AVIF, GIF, PSD, or .photo project. Animated images use their first frame.	请导入 PNG、JPEG、WebP、AVIF、GIF、PSD 或 .photo 项目。动态图像只使用第一帧。
This browser cannot decode HEIC images. Convert the file to JPEG or PNG and open that.	此浏览器无法解码 HEIC 图像。请先转换为 JPEG 或 PNG 再打开。
This browser cannot write AVIF files.	此浏览器无法生成 AVIF 文件。
The embedded color profile is not an RGB matrix profile; colors were converted to sRGB.	嵌入的色彩配置文件不是 RGB 矩阵配置，颜色已转换为 sRGB。
The embedded color profile is not an RGB matrix profile and was not applied.	嵌入的色彩配置文件不是 RGB 矩阵配置，因此未应用。
Animated WebP; the first frame was opened.	此文件为 WebP 动画，已打开第一帧。
CMYK image converted to RGB without color management.	CMYK 图像已转换为 RGB，此次转换未应用色彩管理。
Layer data stored by another editor was ignored; the flattened image was opened.	未读取其他编辑器保存的图层数据，已打开拼合后的图像。
A larger PNG image in the icon was not decoded.	图标中尺寸更大的 PNG 图像未能解码。
Layered TIFF	分层 TIFF
TIFF export flattens the layers into one image. Export a PSD to keep them, or flatten into the TIFF.	导出 TIFF 会将图层拼合为一张图像。若要保留图层，请改为导出 PSD；也可以拼合后导出为 TIFF。
Export PSD Instead	改为导出 PSD
Flatten and Export	拼合并导出
Maximize Compatibility	最大化兼容性
Include a flattened composite image? Other apps and older readers show the file with it; leaving it out makes the file smaller.	要包含拼合后的合成图像吗？其他应用和旧版查看器可用它显示文件。不包含时，文件会更小。
Leave Out	不包含
Include Composite	包含合成图像
Original PSD downloaded with its layers retained.	已下载原始 PSD，图层已保留。
Original PSD file downloaded with its layers retained.	已下载原始 PSD，图层已保留。
Original PSD file downloaded. Preview edits are not included.	已下载原始 PSD，其中不包含对预览的更改。
PSD downloaded with pixel layers, layer masks, clipping and blend modes. Text and adjustments are rasterized; save a .photo project to keep every control.	已下载 PSD，保留了像素图层、图层蒙版、剪贴关系和混合模式。文字和调整已栅格化；如需保留全部可编辑设置，请保存为 .photo 项目。
Multichannel documents are written as their RGB composite; the ink channels stay in the .photo project.	多通道文档会导出为拼合后的 RGB 图像，油墨通道保留在 .photo 项目中。
Clarity & Dehaze and Grain layers have no PSD equivalent: they are written as empty layers and only the merged image shows their effect.	PSD 不支持“清晰度与去朦胧”和“颗粒”图层。这些图层会导出为空图层，效果仅在合成图像中可见。
Updating preview…	正在更新预览…
Encoding…	正在编码…
A .photo project keeps everything.	.photo 项目可保留所有内容。
A .photo project keeps everything opened here, but cannot recover pages, frames or metadata that were not imported.	.photo 项目可保留当前已打开的全部内容，但无法恢复未导入的页面、帧或元数据。
A PSD keeps layers and opens in other apps.	PSD 可保留图层，并可在其他应用中打开。
A PSD opens in other apps. A .photo project is Photo Studio’s own format and also keeps the provenance record.	PSD 可在其他应用中打开。.photo 是 Photo Studio 的项目格式，还可保留来源记录。
layer styles	图层样式
fill layers	填充图层
embedded and linked objects	嵌入和链接对象
frames	框架
vector masks	矢量蒙版
warps	变形
text on a path, area text and dynamic text	路径文字、区域文字和动态文字
scaled or rotated images	缩放或旋转后的图像
layer filter settings	图层滤镜设置
groups that have a style, filter or shape mask	带有样式、滤镜或形状蒙版的图层组
video layers	视频图层
relight layers	重新布光图层
fill opacity	填充不透明度
deep knockout (written as shallow)	深度挖空（导出为浅挖空）
layer color labels and links	图层颜色标签和链接
the frame animation	帧动画
the video timeline and audio	视频时间轴和音频
layer comps	图层复合
slices	切片
variables and data sets	变量和数据组
samplers, counts, notes and the measurement scale	取样点、计数、注释和测量比例
artboard guides	画板参考线
saved paths	已保存的路径
defined patterns	自定义图案
character and paragraph styles	字符和段落样式
perspective planes	透视平面
the Generate Image Assets setting	“生成图像资源”设置
review comments	审阅评论
the layers	图层
the layer’s visibility, opacity, mask, style or other settings	图层的可见性、不透明度、蒙版、样式等设置
guides	参考线
alpha channels	Alpha 通道
the layers another editor stored in it	其他编辑器保存的图层
the CMYK colors	CMYK 颜色
the other frames	其他帧
Open from NAS…	从 NAS 打开…
Pick one or more files on the NAS with the FNOS file picker and open them.	使用飞牛文件选择器挑选 NAS 上的一个或多个文件并打开。
{count} of the selected paths are not supported NAS files and were skipped.	已跳过 {count} 个所选路径：不是受支持的 NAS 文件。
Opened {opened} of {total} NAS files; the failed ones are listed in their dialogs.	已打开 {opened}/{total} 个 NAS 文件；未能打开的见各自对话框。
Destination	保存位置
File name	文件名
NAS folder	NAS 文件夹
Download to this device	下载到本机
Choose the NAS folder to save into	选择保存到的 NAS 文件夹
Choose folder	选择文件夹
Save to NAS…	保存到 NAS…
Overwrite NAS file?	覆盖 NAS 文件？
The file “{name}” already exists or has changed. Overwrite this checked version? This cannot be undone.	文件“{name}”已存在或已被修改。要覆盖刚检查的这个版本吗？此操作无法撤销。
Overwrite	覆盖
Saved {name} to the NAS	已将 {name} 保存到 NAS
Your account or the Photo Studio app does not have write permission for this NAS location.	当前账号或 Photo Studio 应用没有写入此 NAS 位置的权限。
The NAS folder no longer exists. Choose another folder.	NAS 文件夹已不存在，请选择其他文件夹。
The NAS save path is invalid. Folders, links and special files cannot be overwritten.	NAS 保存路径无效，不能覆盖目录、链接或特殊文件。
The file is larger than 512 MiB and cannot be saved to the NAS.	文件超过 512 MiB，无法保存到 NAS。
Saving to NAS failed. Your unsaved changes are still in Photo Studio.	保存到 NAS 失败。未保存的更改仍保留在 Photo Studio 中。
This NAS save request was blocked because its origin is invalid.	NAS 保存请求的来源无效，已被阻止。
Open Photo Studio from the FNOS desktop to save to the NAS.	请从飞牛桌面打开 Photo Studio，再保存到 NAS。
FNOS could not verify write permission. Try again later.	飞牛暂时无法检查写入权限，请稍后重试。
The NAS save request was invalid. The original file was not changed.	NAS 保存参数无效，原文件没有改变。
The NAS save contained no data. The original file was not changed.	NAS 保存内容为空，原文件没有改变。
The NAS upload timed out. The original file was not changed.	NAS 上传超时，原文件没有改变。
Photo Studio cannot safely preserve the permissions of this file. Save with a new filename instead.	Photo Studio 无法安全保留此文件的权限，请使用新文件名另存为。
The NAS file already exists or changed since it was opened.	NAS 文件已存在，或打开后已被修改。
The NAS save result could not be confirmed. Keep this document open and check the file before trying again.	无法确认 NAS 保存结果。请保留此文档，在重试前检查 NAS 上的文件。
The NAS file changed, but FNOS could not provide a safe overwrite check. Choose a new filename.	NAS 文件已被修改，但飞牛未提供安全覆盖所需的版本信息，请选择新文件名。
The NAS file changed again after confirmation. Nothing was overwritten. Save with a new filename or try again.	确认后 NAS 文件又被修改，本次未覆盖任何文件。请用新文件名另存为或重新尝试。
The NAS folder picker is available inside the FNOS desktop or app. Open Photo Studio there; your document has not been saved.	NAS 文件夹选择器仅在飞牛桌面或客户端内可用。请从那里打开 Photo Studio；此文档尚未保存。
FNOS could not open the folder picker. Your document is still open and unsaved.	飞牛无法打开文件夹选择器。文档仍保留在编辑器中，尚未保存。
FNOS did not authorize the selected folder. Choose a folder your account can access.	飞牛未授权所选文件夹，请选择当前账号可访问的文件夹。
Choose NAS folder	选择 NAS 文件夹
Choose and authorize a folder in the FNOS window. Cancel returns to your unsaved document.	请在飞牛窗口中选择并授权文件夹。点击取消可返回未保存的文档。
The FNOS folder picker timed out. No file was saved; your document is still open.	飞牛文件夹选择超时。未保存任何文件，文档仍保留在编辑器中。
Choose a save destination.	请选择保存位置。
Enter a file name.	请输入文件名。
Use one file name without folders, leading dots or control characters, and match the file format.	请使用单个文件名，不要包含文件夹路径、开头的点或控制字符，扩展名应与文件格式一致。
NAS folder: choose an authorized folder on your NAS.	NAS 文件夹：选择 NAS 上已授权的文件夹。
Puter: save to Puter cloud storage, not to the NAS. A Puter connection is required.	Puter：保存到 Puter 云存储，不是 NAS，需要先连接 Puter。
Download to this device: your browser downloads a file; it does not write to the NAS or Puter.	下载到本机：浏览器下载文件，不会写入 NAS 或 Puter。
Downloaded a copy as {name}	已下载副本 {name}
Exported {name} ({size})	已导出 {name}（{size}）
Exported {name} ({size}) with provenance	已导出 {name}（{size}），包含来源记录
`.trim();
