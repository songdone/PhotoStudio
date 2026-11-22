import { advancedEntries } from './advanced';
import { helpEntries } from './help';
import { supplementalEntries } from './supplemental';
import { fileEntries } from './files';
import { dynamicEntries } from './dynamic';
import { platformEntries } from './platform';
import { fileUIEntries } from './file-ui';
import { preferencesEntries } from './preferences-ui';
import { commandEntries } from './commands';

/** Exact, presentation-only strings. Keys stay identical to upstream UI text.
 * Do not add user document/layer names or perform substring replacement here. */
const entries = `
File	文件
Edit	编辑
Image	图像
Layer	图层
Type	文字
Select	选择
Filter	滤镜
View	视图
Window	窗口
Help	帮助
New	新建
Untitled	未命名
Open	打开
Save	保存
Export	导出
Import	导入
Close	关闭
Cancel	取消
Apply	应用
OK	确定
Done	完成
Yes	是
No	否
None	无
All	全部
Default	默认
Custom	自定义
Reset	重置
Delete	删除
Remove	移除
Add	添加
Create	创建
Duplicate	复制
Rename	重命名
Clear	清除
Browse	浏览
Choose	选择
Settings	设置
Options	选项
Preview	预览
Back	返回
Next	下一步
Previous	上一步
Finish	完成
Continue	继续
Retry	重试
Loading	正在加载
Loading…	正在加载…
Preparing preview…	正在准备预览…
Ready	就绪
Graphics unavailable	图形引擎不可用
Starting graphics…	正在启动图形引擎…
Application menu	应用菜单
Tool options	工具选项
Tools	工具
Editing tools	编辑工具
Tool presets	工具预设
Panels	面板
Bottom panels	底部面板
Collapsed panels	已折叠面板
Panel menu	面板菜单
Panel Options	面板选项
Toggle panels	切换面板显示
Show or hide panels	显示或隐藏面板
Show or hide panels (Tab)	显示或隐藏面板（Tab）
Color theme	界面主题
Dark	深色
Medium	中等
Light	浅色
System	跟随系统
Home	主页
Learn	学习
Start	开始
Start with an image.	从一张图像开始。
Open a photo or a layered PSD, or create something from scratch.	打开照片或分层 PSD，也可以从零开始创作。
Drop image files here to open them	将图像文件拖放到此处打开
New document	新建文档
New Document	新建文档
New document name	新文档名称
Open an image	打开图像
Open from Puter	从 Puter 打开
Save to Puter	保存到 Puter
Puter account	Puter 账户
Search	搜索
Search commands	搜索命令
Search commands, tools and panels	搜索命令、工具和面板
Results	结果
Command	命令
Tool	工具
Panel	面板
No results	没有结果
Type to search menus, tools and panels.	输入内容以搜索菜单、工具和面板。
Filter commands	筛选命令
Filter shortcuts	筛选快捷键
Filter layers by kind	按类型筛选图层
Filter layers by name	按名称筛选图层
Layer filtering	图层筛选
Turn layer filtering on or off	开启或关闭图层筛选
Document	文档
Documents	文档
DOCUMENT	文档
Open documents	已打开的文档
Image canvas	图像画布
Document preview	文档预览
Document title	文档标题
Document layers	文档图层
Document bounds	文档边界
Entire document	整个文档
Entire Image	整个图像
Selected Layer	所选图层
Selected layer	所选图层
Selection	选区
New text	新建文字
Unsaved changes	未保存的更改
Don’t Save	不保存
Don't Save	不保存
Recent	最近使用
Recent files	最近文件
Recent documents	最近文档
Recent files layout	最近文件布局
No recent files	没有最近文件
Files you open or save show up here.	在这里查看打开或保存过的文件。
Clear list	清空列表
Clear Recent File List	清空最近文件列表
Show as grid	网格视图
Show as list	列表视图
New from a preset	从预设新建
More presets	更多预设
All presets and custom sizes	全部预设和自定义尺寸
Custom size	自定义尺寸
Preset categories	预设分类
Preset details	预设详情
Preset name	预设名称
Presets	预设
Preset	预设
Search presets	搜索预设
Search presets: name or size	搜索预设名称或尺寸
Save preset	保存预设
Delete preset	删除预设
Save these settings as a preset	将这些设置保存为预设
Settings you create documents with appear here.	在这里查看创建文档时使用过的设置。
Create a document from a preset or custom settings	使用预设或自定义设置创建文档
Describe an edit	描述编辑需求
Choose image	选择图像
Remove the chosen image	移除所选图像
Remove the image	移除图像
Without an image, a new document is created	未选择图像时将创建新文档
For example: brighten this photo, crop it to a square and add a soft vignette	例如：提亮照片，裁剪为正方形，并添加柔和的暗角
The Assistant plans the edit with Photo Studio’s own commands for you to review before anything changes.	助手会使用 Photo Studio 的内置命令制定编辑方案，供你确认后执行。
Name	名称
As	名称
Title	标题
Description	描述
Author	作者
Keywords	关键词
Copyright	版权
Copyright notice	版权声明
Copyright and contact info	版权和联系信息
Contact (email or website)	联系方式（邮箱或网站）
File Info	文件信息
All file info	全部文件信息
Title, author and copyright are written to exported PNG and JPEG files when metadata is included.	导出 PNG 和 JPEG 时，若包含元数据，将写入标题、作者和版权信息。
Width	宽度
Height	高度
Width (px)	宽度（像素）
Height (px)	高度（像素）
W (px)	宽（像素）
H (px)	高（像素）
Canvas width	画布宽度
Canvas height	画布高度
Image width	图像宽度
Image height	图像高度
Size	大小
Dimensions	尺寸
Resolution	分辨率
Resolution units	分辨率单位
Units	单位
Pixels	像素
Percent	百分比
Inches	英寸
Centimeters	厘米
Millimeters	毫米
Points	点
Picas	派卡
Pixels/Inch	像素/英寸
Pixels/Centimeter	像素/厘米
Landscape	横向
Portrait	纵向
Landscape: make the canvas wider than tall	横向：画布宽度大于高度
Portrait: make the canvas taller than wide	纵向：画布高度大于宽度
Link canvas width and height	锁定画布宽高比
Width and height keep proportions	保持宽高比例
Anchor	定位
Relative	相对
Color mode	颜色模式
Mode	模式
RGB Color	RGB 颜色
CMYK Color	CMYK 颜色
Lab Color	Lab 颜色
Grayscale	灰度
Bitmap	位图
Duotone	双色调
Indexed Color	索引颜色
Multichannel	多通道
Bit depth	位深度
Depth	深度
8 bit	8 位
8 bits/channel	8 位/通道
16 bits/channel	16 位/通道
32 bits/channel	32 位/通道
Color profile	颜色配置文件
Working space	工作空间
Pixel aspect ratio	像素长宽比
Pixel Aspect Ratio	像素长宽比
Square Pixels	方形像素
Background contents	背景内容
Background Color	背景色
Background color	背景色
Foreground Color	前景色
Foreground color	前景色
Foreground color value	前景色值
Background fill color	背景填充颜色
Custom background color	自定义背景颜色
Choose a custom background color	选择自定义背景颜色
Transparent	透明
Transparency	透明度
White	白色
Black	黑色
50% Gray	50% 灰色
Gray	灰色
Grey	灰色
Red	红色
Green	绿色
Blue	蓝色
Cyan	青色
Magenta	洋红
Yellow	黄色
Reds	红色
Yellows	黄色
Greens	绿色
Cyans	青色
Blues	蓝色
Magentas	洋红
Whites	白色
Neutrals	中性色
Blacks	黑色
Colors	颜色
Color	颜色
Set foreground color	设置前景色
Set background color	设置背景色
Set Foreground Color	设置前景色
Set Background Color	设置背景色
Default colors	默认颜色
Default foreground and background colors (D)	默认前景色和背景色（D）
Switch colors	交换颜色
Switch foreground and background colors (X)	交换前景色和背景色（X）
Hex	十六进制
Hex color	十六进制颜色
Color hue	色相
Color saturation and brightness	颜色饱和度与明度
Zoom	缩放
Zoom in	放大
Zoom out	缩小
Zoom In	放大
Zoom Out	缩小
Zoom level	缩放级别
Type a zoom level and press Enter	输入缩放比例并按 Enter
Click to switch between fit and actual size	点击切换适合窗口与实际大小
Fit on Screen	适合屏幕
Fit to Screen	适合屏幕
Fill Screen	填满屏幕
Actual Pixels	实际像素
Print Size	打印尺寸
Actual Size	实际大小
Print size	打印尺寸
Navigator	导航器
Histogram	直方图
History	历史记录
Layers	图层
Channels	通道
Paths	路径
Properties	属性
Properties of the open image appear here	在这里查看已打开图像的属性
Your layers will appear here	图层将显示在这里
Add an image	添加图像
Earlier steps are no longer kept	更早的步骤已不再保留
Use Undo and Redo to step through your edits.	使用撤销和重做浏览编辑步骤。
Undo	撤销
Redo	重做
Undo / Redo	撤销 / 重做
Copy	复制
Cut	剪切
Paste	粘贴
Copy Merged	合并拷贝
Paste Special	选择性粘贴
Paste in Place	原位粘贴
Paste Into	贴入
Paste Outside	外部粘贴
Paste without Formatting	粘贴为纯文本
Paste Text Attributes	粘贴文字属性
Fill	填充
Stroke	描边
Free Transform	自由变换
Transform	变换
Transform Again	再次变换
Scale	缩放
Rotate	旋转
Rotation	旋转
Angle	角度
Skew	斜切
Distort	扭曲
Perspective	透视
Warp	变形
Flip Horizontal	水平翻转
Flip Vertical	垂直翻转
Rotate 180°	旋转 180°
Rotate 90° Clockwise	顺时针旋转 90°
Rotate 90° Counterclockwise	逆时针旋转 90°
Rotate 90° CW	顺时针旋转 90°
Rotate 90° CCW	逆时针旋转 90°
Purge	清理
Preferences	首选项
Keyboard Shortcuts	键盘快捷键
Edit Toolbar	编辑工具栏
Reset to Defaults	恢复默认设置
Press keys…	请按快捷键…
Adjustments	调整
Brightness/Contrast	亮度/对比度
Brightness / Contrast	亮度/对比度
Brightness & Contrast	亮度/对比度
Levels	色阶
Curves	曲线
Exposure	曝光度
Vibrance	自然饱和度
Hue/Saturation	色相/饱和度
Hue / Saturation	色相/饱和度
Color Balance	色彩平衡
Black & White	黑白
Black and White	黑白
Photo Filter	照片滤镜
Channel Mixer	通道混合器
Color Lookup	颜色查找
Invert	反相
Posterize	色调分离
Threshold	阈值
Gradient Map	渐变映射
Selective Color	可选颜色
Shadows/Highlights	阴影/高光
Shadows / Highlights	阴影/高光
HDR Toning	HDR 色调
Desaturate	去色
Match Color	匹配颜色
Replace Color	替换颜色
Equalize	色调均化
Auto Tone	自动色调
Auto Contrast	自动对比度
Auto Color	自动颜色
Light & Tone	光线与色调
Light and Tone	光线与色调
Color & Vibrance	色彩与自然饱和度
Clarity & Dehaze	清晰度与去朦胧
Grain	颗粒
Brightness	亮度
Contrast	对比度
Hue	色相
Saturation	饱和度
Lightness	明度
Luminance	明亮度
Temperature	色温
Tint	色调
Highlights	高光
Shadows	阴影
Midtones	中间调
Gamma	伽马
Offset	位移
Input	输入
Output	输出
Input Levels	输入色阶
Output Levels	输出色阶
Input levels	输入色阶
Output levels	输出色阶
Black point	黑场
White point	白场
Midpoint	中点
Auto	自动
Reset adjustments	重置调整
Channel	通道
Master	全图
Composite	复合
Preserve Luminosity	保持明度
Preserve luminosity	保持明度
Colorize	着色
Use Legacy	使用旧版
Use legacy	使用旧版
Amount	数量
Radius	半径
Threshold (levels)	阈值（色阶）
Strength	强度
Range	范围
Fuzziness	颜色容差
Density	浓度
Blend mode	混合模式
Blend Mode	混合模式
Blending	混合
Blending Options	混合选项
Normal	正常
Dissolve	溶解
Darken	变暗
Multiply	正片叠底
Color Burn	颜色加深
Linear Burn	线性加深
Darker Color	深色
Lighten	变亮
Screen	滤色
Color Dodge	颜色减淡
Linear Dodge	线性减淡
Linear Dodge (Add)	线性减淡（添加）
Lighter Color	浅色
Overlay	叠加
Soft Light	柔光
Hard Light	强光
Vivid Light	亮光
Linear Light	线性光
Pin Light	点光
Hard Mix	实色混合
Difference	差值
Exclusion	排除
Subtract	减去
Divide	划分
Luminosity	明度
Pass Through	穿透
Color burn	颜色加深
Linear burn	线性加深
Darker color	深色
Color dodge	颜色减淡
Linear dodge	线性减淡
Lighter color	浅色
Soft light	柔光
Hard light	强光
Vivid light	亮光
Linear light	线性光
Pin light	点光
Hard mix	实色混合
Pass through	穿透
Opacity	不透明度
Opacity (%)	不透明度（%）
Fill Opacity	填充不透明度
Layer Opacity	图层不透明度
Lock:	锁定：
Lock all	全部锁定
Lock layer	锁定图层
Lock position	锁定位置
Lock transparency	锁定透明像素
Lock transparent pixels	锁定透明像素
Lock image pixels	锁定图像像素
Layer locked	图层已锁定
Layer partially locked	图层部分锁定
Unlock	解锁
Show	显示
Hide	隐藏
Show layer	显示图层
Hide layer	隐藏图层
New Layer	新建图层
New layer	新建图层
New Group	新建组
New group	新建组
New Fill Layer	新建填充图层
New Adjustment Layer	新建调整图层
New fill or adjustment layer	新建填充或调整图层
Create new fill or adjustment layer	创建填充或调整图层
Create a new layer (Alt-click for options)	创建新图层（按住 Alt 点击可设置选项）
Create a new group (Alt-click for options)	创建新组（按住 Alt 点击可设置选项）
Create new snapshot	创建快照
Add Layer Mask	添加图层蒙版
Add layer mask	添加图层蒙版
Add a layer style	添加图层样式
Delete layer	删除图层
Layer Properties	图层属性
Layer name	图层名称
Layer from Background	背景图层转普通图层
Background from Layer	图层转背景图层
Duplicate Layer	复制图层
Rename Layer	重命名图层
Delete Hidden Layers	删除隐藏图层
Layer via Copy	通过拷贝的图层
Layer via Cut	通过剪切的图层
Group Layers	图层编组
Ungroup Layers	取消图层编组
Group selected layers	将所选图层编组
Link Layers	链接图层
Link layers	链接图层
Linked layer	已链接图层
Unlink Layers	取消图层链接
Link or unlink the selected layers	链接或取消链接所选图层
Linked layers move and transform together	已链接的图层会一起移动和变换
Select Linked Layers	选择链接图层
Merge Down	向下合并
Merge Visible	合并可见图层
Flatten Image	拼合图像
Flattened image	已拼合图像
Rasterize	栅格化
Rasterize Layer	栅格化图层
Rasterize All Layers	栅格化所有图层
Hidden Layers	隐藏图层
All Layers	所有图层
Visible layers only	仅可见图层
Kind	类型
Pixel layers	像素图层
Type layers	文字图层
Shape layers	形状图层
Adjustment and fill layers	调整和填充图层
Embedded objects	嵌入对象
Embedded Objects	嵌入对象
Video Layers	视频图层
Layer Style	图层样式
Layer Styles	图层样式
Layer Mask	图层蒙版
Vector Mask	矢量蒙版
Clipping Mask	剪贴蒙版
Clipping mask	剪贴蒙版
Create Clipping Mask	创建剪贴蒙版
Release Clipping Mask	释放剪贴蒙版
Clipped to the layer below	剪贴到下方图层
Clip to the layer below (clipping mask)	剪贴到下方图层（剪贴蒙版）
Layer mask (click to edit, Shift-click to disable)	图层蒙版（点击编辑，按住 Shift 点击停用）
Mask moves with the layer (click to unlink)	蒙版随图层移动（点击取消链接）
Mask stays in place (click to link)	蒙版保持原位（点击链接）
Edit layer mask	编辑图层蒙版
Remove mask	移除蒙版
Link mask to layer	将蒙版链接到图层
Move the layer mask together with the layer	图层蒙版随图层一起移动
Move the vector mask together with the layer	矢量蒙版随图层一起移动
Move the layer’s transparency into a layer mask	将图层透明度转换为图层蒙版
From Transparency	从透明度
Reveal All	显示全部
Hide All	隐藏全部
Reveal Selection	显示选区
Hide Selection	隐藏选区
Apply Layer Mask	应用图层蒙版
Delete Layer Mask	删除图层蒙版
Disable Layer Mask	停用图层蒙版
Enable Layer Mask	启用图层蒙版
Arrange	排列
Align	对齐
Distribute	分布
Bring to Front	置于顶层
Bring Forward	前移一层
Send Backward	后移一层
Send to Back	置于底层
Reverse	反向
Combine Shapes	合并形状
Matting	修边
Defringe	去边
Remove Black Matte	移去黑色杂边
Remove White Matte	移去白色杂边
Live Filters	实时滤镜
Live Filter	实时滤镜
Remove Background	移除背景
Select Subject	选择主体
Select Sky	选择天空
Color Range	色彩范围
Focus Area	焦点区域
Select and Mask	选择并遮住
Deselect	取消选择
Reselect	重新选择
Inverse	反向
All Layers	所有图层
Deselect Layers	取消选择图层
Find Layers	查找图层
Isolate Layers	隔离图层
Isolated layers	已隔离的图层
Show all layers again	重新显示所有图层
Show only the selected layers in the Layers panel	仅在图层面板显示所选图层
Modify	修改
Border	边界
Smooth	平滑
Expand	扩展
Contract	收缩
Feather	羽化
Grow	扩大选取
Similar	选取相似
Transform Selection	变换选区
Load Selection	载入选区
Save Selection	存储选区
Load Layer Transparency	载入图层透明度
Quick Mask mode	快速蒙版模式
Quick Mask Options	快速蒙版选项
Edit in Quick Mask mode (Q)\nDouble-click or Alt-click for options	以快速蒙版模式编辑（Q）\n双击或按住 Alt 点击可设置选项
Select All	全选
Select All Layers	选择所有图层
Select Top Layer	选择顶层图层
Select Bottom Layer	选择底层图层
Select Layer Above	选择上方图层
Select Layer Below	选择下方图层
Add Layer Above to Selection	将上方图层添加到选择
Add Layer Below to Selection	将下方图层添加到选择
Shift-click selects a range. Cmd/Ctrl-click toggles a layer.	按住 Shift 点击选择范围；按住 Cmd/Ctrl 点击切换图层选择。
Image Size	图像大小
Canvas Size	画布大小
Image Rotation	图像旋转
Crop	裁剪
Trim	修边
Reveal All	显示全部
Duplicate Image	复制图像
Apply Image	应用图像
Calculations	计算
Variables	变量
Data Sets	数据组
Define	定义
Analysis	分析
Set Measurement Scale	设置测量比例
Measurement Log	测量记录
Record Measurements	记录测量
Resize	调整大小
Resize to fit	调整大小以适应
Resample	重新采样
Resampling	重新采样
Bicubic	两次立方
Bilinear	两次线性
Nearest Neighbor	邻近
Nearest neighbor (hard edges)	邻近（硬边缘）
Lanczos (sharper)	Lanczos（更锐利）
Automatic	自动
Constrain Proportions	约束比例
Scale Styles	缩放样式
Scale styles	缩放样式
Link layer width and height	锁定图层宽高比
Changes the print size; pixels stay as they are	调整打印尺寸，像素保持不变
Size changes grow or shrink the canvas from the anchor.	尺寸调整以定位点为基准增减画布。
Trim transparent pixels	裁剪透明像素
Trim transparent pixels from the edges	裁剪边缘透明像素
Enlarge the canvas to show every layer	扩展画布以显示所有图层
Flip the canvas horizontally	水平翻转画布
Flip the canvas vertically	垂直翻转画布
Rotate the canvas 90° clockwise	顺时针旋转画布 90°
Rotate the canvas 90° counterclockwise	逆时针旋转画布 90°
Move Tool	移动工具
Move	移动
Artboard Tool	画板工具
Rectangular Marquee Tool	矩形选框工具
Elliptical Marquee Tool	椭圆选框工具
Single Row Marquee Tool	单行选框工具
Single Column Marquee Tool	单列选框工具
Lasso Tool	套索工具
Polygonal Lasso Tool	多边形套索工具
Magnetic Lasso Tool	磁性套索工具
Object Selection Tool	对象选择工具
Quick Selection Tool	快速选择工具
Magic Wand Tool	魔棒工具
Crop Tool	裁剪工具
Perspective Crop Tool	透视裁剪工具
Slice Tool	切片工具
Slice Select Tool	切片选择工具
Frame Tool	图框工具
Eyedropper Tool	吸管工具
Color Sampler Tool	颜色取样器工具
Ruler Tool	标尺工具
Note Tool	注释工具
Count Tool	计数工具
Spot Healing Brush Tool	污点修复画笔工具
Healing Brush Tool	修复画笔工具
Patch Tool	修补工具
Red Eye Tool	红眼工具
Remove Tool	移除工具
Brush Tool	画笔工具
Pencil Tool	铅笔工具
Color Replacement Tool	颜色替换工具
Mixer Brush Tool	混合器画笔工具
Clone Stamp Tool	仿制图章工具
Pattern Stamp Tool	图案图章工具
History Brush Tool	历史记录画笔工具
Art History Brush Tool	历史记录艺术画笔工具
Eraser Tool	橡皮擦工具
Background Eraser Tool	背景橡皮擦工具
Magic Eraser Tool	魔术橡皮擦工具
Gradient Tool	渐变工具
Paint Bucket Tool	油漆桶工具
Blur Tool	模糊工具
Sharpen Tool	锐化工具
Smudge Tool	涂抹工具
Dodge Tool	减淡工具
Burn Tool	加深工具
Sponge Tool	海绵工具
Pen Tool	钢笔工具
Freeform Pen Tool	自由钢笔工具
Curvature Pen Tool	弯度钢笔工具
Add Anchor Point Tool	添加锚点工具
Delete Anchor Point Tool	删除锚点工具
Convert Point Tool	转换点工具
Horizontal Type Tool	横排文字工具
Vertical Type Tool	直排文字工具
Horizontal Type Mask Tool	横排文字蒙版工具
Vertical Type Mask Tool	直排文字蒙版工具
Path Selection Tool	路径选择工具
Direct Selection Tool	直接选择工具
Rectangle Tool	矩形工具
Rounded Rectangle Tool	圆角矩形工具
Ellipse Tool	椭圆工具
Triangle Tool	三角形工具
Polygon Tool	多边形工具
Line Tool	直线工具
Custom Shape Tool	自定形状工具
Hand Tool	抓手工具
Rotate View Tool	旋转视图工具
Zoom Tool	缩放工具
Extra tools	额外工具
Edit toolbar	编辑工具栏
Auto-Select	自动选择
Auto-select	自动选择
Show Transform Controls	显示变换控件
Show transform controls	显示变换控件
Sample All Layers	对所有图层取样
Sample all layers	对所有图层取样
Contiguous	连续
Tolerance	容差
Tolerance (%)	容差（%）
Anti-alias	消除锯齿
Anti-Alias	消除锯齿
Feather (px)	羽化（像素）
New selection	新选区
Add to selection	添加到选区
Subtract from selection	从选区中减去
Intersect with selection	与选区交叉
Brush	画笔
Brushes	画笔
Brush Settings	画笔设置
Brush settings	画笔设置
Brush presets	画笔预设
Brush preset and size	画笔预设和大小
Brush size (px)	画笔大小（像素）
Brush hardness (%)	画笔硬度（%）
Brush opacity (%)	画笔不透明度（%）
Brush flow (%)	画笔流量（%）
Brush angle (degrees)	画笔角度（度）
Brush blend mode	画笔混合模式
Hardness	硬度
Flow	流量
Smoothing	平滑
Smoothing (%)	平滑（%）
Roundness	圆度
Spacing	间距
Airbrush	喷枪
Airbrush build-up	喷枪累积效果
Pressure controls size	压感控制大小
Pressure controls opacity	压感控制不透明度
Symmetry	对称
Segments	分段
Catch Up on Stroke End	描边结束时补齐
Pulled String Mode	拉绳模式
Adjust for Zoom	根据缩放调整
Finish the stroke at the pointer when the button is released	松开按钮时将描边补齐至指针位置
Judge smoothing on screen: less when zoomed in, more when zoomed out	按屏幕缩放调整平滑：放大时减少，缩小时增加
Angle of the brush tip	笔尖角度
How many times the stroke repeats around the center	描边围绕中心重复的次数
Radius over which strokes are painted	绘制描边的半径
Strokes repeat about the center of the canvas.	描边围绕画布中心重复。
Auto Erase	自动抹除
Eraser mode	橡皮擦模式
Erase to History	抹到历史记录
Preserve Transparency	保留透明区域
Fill blend mode	填充混合模式
Fill with the neutral color for this mode	填充此模式的中性色
Load Brush	载入画笔
Clean Brush	清理画笔
Reset Brush	重置画笔
Brush load	画笔载入量
Load Solid Colors Only	仅载入纯色
Mix	混合
Wet	潮湿
Load	载入
Wet, load and mix combination	潮湿、载入量和混合组合
Fill the Mixer Brush with the foreground color.	用前景色填充混合器画笔。
Empty the Mixer Brush reservoir and tip.	清空混合器画笔的储色槽和笔尖。
Set the source for the History Brush	设置历史记录画笔源
Source	源
Destination	目标
Pattern	图案
Patterns	图案
Gradient	渐变
Gradients	渐变
Swatches	色板
Add foreground color	添加前景色
Add swatch from foreground color	从前景色添加色板
Reset Swatches	重置色板
Solid	纯色
Solid Color	纯色
Gradient fill	渐变填充
Pattern fill	图案填充
Color Fill	颜色填充
Linear	线性
Radial	径向
Reflected	对称
Diamond	菱形
Style	样式
Styles	样式
Gradient style	渐变样式
Reverse gradient	反向渐变
Align gradient with layer	渐变与图层对齐
Link pattern to layer	图案链接到图层
Color stops	颜色色标
Opacity stops	不透明度色标
Add color stop	添加颜色色标
Add opacity stop	添加不透明度色标
Location	位置
Position	位置
Dither	仿色
Smoothness	平滑度
Noise	杂色
Roughness	粗糙度
Restrict Colors	限制颜色
Add Transparency	添加透明度
Stroke color	描边颜色
Stroke style	描边样式
Show fill	显示填充
Show stroke	显示描边
Stroke unavailable for these path operations	这些路径操作无法使用描边
Inside	内部
Center	居中
Outside	外部
Butt	平头
Round	圆头
Square	方头
Miter	尖角
Bevel	斜角
Dashed	虚线
Solid line	实线
Dash and gap lengths (pixels)	虚线和间隔长度（像素）
Bevel & Emboss	斜面和浮雕
Stroke	描边
Inner Shadow	内阴影
Inner Glow	内发光
Satin	光泽
Color Overlay	颜色叠加
Gradient Overlay	渐变叠加
Pattern Overlay	图案叠加
Outer Glow	外发光
Drop Shadow	投影
Global Light	全局光
Use Global Light	使用全局光
Use global light	使用全局光
Contour	等高线
Gloss Contour	光泽等高线
Distance	距离
Spread	扩展
Choke	阻塞
Technique	方法
Direction	方向
Up	上
Down	下
Altitude	高度
Highlight Mode	高光模式
Shadow Mode	阴影模式
Knockout	挖空
Advanced Blending	高级混合
Blend If	混合颜色带
This Layer	本图层
Underlying Layer	下一图层
Hide All Effects	隐藏所有效果
Show All Effects	显示所有效果
Copy Layer Style	拷贝图层样式
Paste Layer Style	粘贴图层样式
Clear Layer Style	清除图层样式
Scale Effects	缩放效果
Create Layers	创建图层
Blur	模糊
Blur Gallery	模糊画廊
Gaussian Blur	高斯模糊
Box Blur	方框模糊
Average	平均
Motion Blur	动感模糊
Radial Blur	径向模糊
Surface Blur	表面模糊
Lens Blur	镜头模糊
Shape Blur	形状模糊
Field Blur	场景模糊
Iris Blur	光圈模糊
Tilt-Shift	移轴模糊
Path Blur	路径模糊
Spin Blur	旋转模糊
Add Noise	添加杂色
Despeckle	去斑
Dust & Scratches	蒙尘与划痕
Median	中间值
Reduce Noise	减少杂色
Sharpen	锐化
Sharpen Edges	锐化边缘
Sharpen More	进一步锐化
Unsharp Mask	USM 锐化
Emboss	浮雕效果
Find Edges	查找边缘
Solarize	曝光过度
Diffuse	扩散
Wind	风
Oil Paint	油画
Stylize	风格化
Pixelate	像素化
Color Halftone	彩色半调
Crystallize	晶格化
Facet	彩块化
Fragment	碎片
Mezzotint	铜版雕刻
Mosaic	马赛克
Pointillize	点状化
Render	渲染
Clouds	云彩
Difference Clouds	分层云彩
Fibers	纤维
Lens Flare	镜头光晕
Lighting Effects	光照效果
High Pass	高反差保留
Maximum	最大值
Minimum	最小值
Other	其他
Video	视频
De-Interlace	去交错
NTSC Colors	NTSC 颜色
Displace	置换
Pinch	挤压
Polar Coordinates	极坐标
Ripple	波纹
Shear	切变
Spherize	球面化
Twirl	旋转扭曲
Wave	波浪
ZigZag	水波
Filter Gallery	滤镜库
Develop Filter	照片显影滤镜
Liquify	液化
Lens Correction	镜头校正
Vanishing Point	消失点
Perspective Planes	透视平面
Last Filter	上次滤镜
Fade	渐隐
Convert for Live Filters	转换为实时滤镜
Live Filter Mask from Selection	从选区创建实时滤镜蒙版
Portrait & Restore	人像与修复
Denoise	降噪
Sharpen Details	锐化细节
Uniform	平均分布
Gaussian	高斯分布
Monochromatic	单色
Quality	品质
Low	低
High	高
Best	最佳
Draft	草稿
Fine	精细
Coarse	粗糙
Horizontal	水平
Vertical	垂直
Both	两者
Edge	边缘
Edges	边缘
Wrap Around	折回
Repeat Edge Pixels	重复边缘像素
Use background color	使用背景色
Use foreground color	使用前景色
Transparent areas	透明区域
Lens	镜头
Distortion	畸变
Vignette	暗角
Vignetting	暗角
Chromatic Aberration	色差
Remove Chromatic Aberration	移除色差
Geometry	几何
Detail	细节
Details	细节
Clarity	清晰度
Texture	纹理
Dehaze	去朦胧
Sharpening	锐化
Noise Reduction	降噪
Color Noise	彩色杂色
Color noise	彩色杂色
Luminance noise	明度杂色
White Balance	白平衡
White balance	白平衡
As Shot	原照设置
Daylight	日光
Cloudy	阴天
Shade	阴影
Tungsten	白炽灯
Fluorescent	荧光灯
Flash	闪光灯
Auto white balance	自动白平衡
Before	之前
After	之后
Before / After	之前 / 之后
Split view	分割视图
Side by side	并排
Reset All	全部重置
Character	字符
Paragraph	段落
Glyphs	字形
Character Styles	字符样式
Paragraph Styles	段落样式
Font	字体
Font family	字体家族
Font style	字体样式
Font size	字体大小
Size (pt)	大小（点）
Leading	行距
Tracking	字距
Kerning	字偶间距
Baseline shift	基线偏移
Horizontal scale	水平缩放
Vertical scale	垂直缩放
Faux Bold	仿粗体
Faux Italic	仿斜体
All Caps	全部大写
Small Caps	小型大写字母
Superscript	上标
Subscript	下标
Underline	下划线
Strikethrough	删除线
Align left	左对齐
Align center	居中对齐
Align right	右对齐
Justify	两端对齐
Left indent	左缩进
Right indent	右缩进
First line indent	首行缩进
Space before	段前间距
Space after	段后间距
Hyphenate	连字
Hyphenation	连字
Orientation	方向
Horizontal Type	横排文字
Vertical Type	直排文字
OpenType	OpenType
Stylistic Sets	样式集
Font Preview Size	字体预览大小
Language Options	语言选项
More Fonts	更多字体
Match Font	匹配字体
Replace Missing Fonts	替换缺失字体
Create Work Path	创建工作路径
Convert to Shape	转换为形状
Convert to Paragraph Text	转换为段落文字
Convert to Point Text	转换为点文字
Convert to Dynamic Text	转换为动态文字
Warp Text	文字变形
Text	文字
Text color	文字颜色
Text orientation	文字方向
Text direction	文字方向
Language	语言
Left to Right	从左到右
Right to Left	从右到左
Sharp	锐利
Crisp	锐利
Strong	浑厚
Smooth	平滑
Mixed styles	混合样式
Small	小
Large	大
Extra Large	特大
Huge	超大
Grid	网格
Guides	参考线
Rulers	标尺
Snap	吸附
Snap To	吸附到
Show All	显示全部
Extras	额外内容
Proof Setup	校样设置
Proof Colors	校样颜色
Gamut Warning	色域警告
Screen Mode	屏幕模式
Change screen mode	切换屏幕模式
Standard Screen Mode	标准屏幕模式
Full Screen Mode With Menu Bar	带菜单栏的全屏模式
Full Screen Mode	全屏模式
Reset View	重置视图
Reset Rotation	重置旋转
Pattern Preview	图案预览
New Guide	新建参考线
New Guide Layout	新建参考线版面
Lock Guides	锁定参考线
Clear Guides	清除参考线
Clear Selected Guides	清除所选参考线
New Guides from Shape	从形状新建参考线
Grid points	网格点
Subdivisions	子网格
Rows	行
Columns	列
Gutter	间距
Margin	边距
Top	上
Bottom	下
Left	左
Right	右
Horizontal Center	水平居中
Vertical Center	垂直居中
Top Edges	顶边
Bottom Edges	底边
Left Edges	左边
Right Edges	右边
Artboards	画板
Artboard	画板
Layer Comps	图层复合
Notes	注释
Count	计数
Info	信息
Actions	动作
Timeline	时间轴
Animation	动画
Frame Animation	帧动画
Video Timeline	视频时间轴
Audio	音频
Play	播放
Pause	暂停
Stop	停止
First Frame	第一帧
Previous Frame	上一帧
Next Frame	下一帧
Last Frame	最后一帧
Looping	循环
Forever	永远
Once	一次
3 times	3 次
Frame delay (ms)	帧延迟（毫秒）
Each visible layer as an animation frame	将每个可见图层作为一帧动画
Export GIF	导出 GIF
Export Animation	导出动画
Render Video	渲染视频
Frame rate	帧速率
Duration	时长
Start time	开始时间
End time	结束时间
Volume	音量
Mute	静音
Unmute	取消静音
Opacity keyframes	不透明度关键帧
Position keyframes	位置关键帧
Enable	启用
Disable	停用
Enabled	已启用
Disabled	已停用
Workspace	工作区
Workspaces	工作区
Essentials	基本功能
Photography	摄影
Painting	绘画
Graphic and Web	图形与网页
Motion	动态
New Workspace	新建工作区
Delete Workspace	删除工作区
Reset Workspace	重置工作区
Collapse to Icons	折叠为图标
Collapse to Icon	折叠为图标
Dock as Tab	停靠为标签页
Close Tab Group	关闭标签页组
Minimize Tab Group	最小化标签页组
Drop a panel here	将面板拖放到此处
Drop here to move to the top level	拖放到此处以移到顶层
Customize	自定义
Menus	菜单
Menu	菜单
Built-in	内置
General	常规
Interface	界面
Performance	性能
File Handling	文件处理
Cursors	光标
Units & Rulers	单位与标尺
Guides, Grid & Slices	参考线、网格和切片
Export As	导出为
Quick Export as PNG	快速导出为 PNG
Export Layers to Files	将图层导出到文件
File type	文件类型
File name prefix	文件名前缀
Format	格式
Metadata	元数据
Include metadata	包含元数据
Color space	色彩空间
Convert to sRGB	转换为 sRGB
Embed color profile	嵌入颜色配置文件
Trim transparent pixels	裁剪透明像素
Include document bounds	包含文档边界
Do not enlarge smaller images	不放大小图像
Download	下载
Download as ZIP archive	下载为 ZIP 压缩包
Export Preferences	导出首选项
Export with format, size, metadata and color options	选择格式、大小、元数据和颜色选项后导出
Export the selected layers with format, size and color options	选择格式、大小和颜色选项后导出所选图层
Export the selected layers, trimmed to their content, as a PNG	按内容边界裁剪所选图层并导出为 PNG
Export a GIF, optionally animating the layers	导出 GIF，也可将图层制作成动画
Export layers as SVG shapes, text and images	将图层导出为 SVG 形状、文字和图像
Export saved paths and the work path as SVG	将已保存路径和工作路径导出为 SVG
Export the effect of the adjustment layers as a .cube, .3dl or .csp table	将调整图层效果导出为 .cube、.3dl 或 .csp 颜色查找表
Each top-level layer (groups as one image) is saved as its own file, using the quality, metadata and color settings from Export As.	每个顶层图层单独保存为文件（组视为一张图像），使用“导出为”的品质、元数据和颜色设置。
Automate	自动
Batch	批处理
Image Processor	图像处理器
Images to process	要处理的图像
Select images	选择图像
No images selected	未选择图像
Add from this device	从此设备添加
Add from Puter	从 Puter 添加
Add open documents	添加已打开文档
Run	运行
Steps	步骤
Every	每
Process	处理
Output folder	输出文件夹
Destination folder	目标文件夹
Source folder	源文件夹
Run steps on many files and save the results	批量执行步骤并保存结果
Convert and resize many images at once	批量转换图像并调整大小
Open one or more files from Puter	从 Puter 打开一个或多个文件
Save a copy to Puter without changing where this document saves	将副本保存到 Puter，保持当前文档的保存位置
Save to Puter: a document opened from a PSD or an image file (PNG, JPEG, WebP, ...) saves back in that format, others as a .photo project	保存到 Puter：从 PSD 或图像文件（PNG、JPEG、WebP 等）打开的文档使用原格式，其他文档保存为 .photo 项目
Save to a new Puter location as a .photo project, a PSD or the image format the document came from	另选 Puter 位置，保存为 .photo 项目、PSD 或原图像格式
Add every layer of a PSD or .photo file to this document as a group	将 PSD 或 .photo 文件的所有图层作为组添加到当前文档
Add every layer of a PSD or .photo file on Puter to this document as a group	将 Puter 上的 PSD 或 .photo 文件的所有图层作为组添加到当前文档
Collect the project and its linked files into a ZIP	将项目及其链接文件打包为 ZIP
Scripts	脚本
Script Events Manager	脚本事件管理器
Delete All Empty Layers	删除所有空图层
Flatten All Layer Effects	栅格化所有图层效果
Flatten All Masks	应用所有蒙版
Bake every layer style into its layer’s pixels	将所有图层样式栅格化到图层像素
Apply every layer mask and vector mask to its layer	将所有图层蒙版和矢量蒙版应用到各自图层
PDF Presentation	PDF 演示文稿
Load Files into Stack	将文件载入堆栈
Statistics	统计
Fit Image	适合图像
Crop and Straighten Photos	裁剪并修齐照片
Merge to HDR	合并为 HDR
Panorama	全景拼接
History purged.	已清理历史记录。
Select a single layer for this adjustment.	请选择单个图层进行此调整。
Unlock this layer to edit it.	请先解锁图层再编辑。
Unlock this layer to add a mask.	请先解锁图层再添加蒙版。
Nothing to paste.	没有可粘贴的内容。
Copied	已复制
Copied merged pixels	已复制合并后的像素
Select a layer to copy from.	请选择要复制的图层。
Nothing to trim: the image is fully transparent.	没有可裁剪的内容：图像完全透明。
There is no layer below to clip to.	没有可创建剪贴蒙版的下方图层。
The Background layer cannot be the base of a clipping mask.	背景图层不能作为剪贴蒙版的基底。
Show the layer before merging its clipping mask.	请先显示图层再合并剪贴蒙版。
An adjustment layer cannot receive merged pixels.	调整图层无法接收合并后的像素。
There is no layer below to merge into.	没有可合并的下方图层。
The layer below cannot receive merged pixels.	下方图层无法接收合并后的像素。
Show both layers before merging them.	请先显示两个图层再合并。
Select three or more layers to distribute them.	请选择至少三个图层进行分布。
One layer aligns to the selection, or to the canvas when nothing is selected.	单个图层与选区对齐；无选区时与画布对齐。
PSD opened	已打开 PSD
Project opened	已打开项目
Analyzing the image…	正在分析图像…
WebGPU is not available in this browser; using WebGL2.	此浏览器不支持 WebGPU，正在使用 WebGL2。
The Background layer has image content; paint on it or convert it to a layer to change it.	背景图层包含图像内容；可直接绘画，或转为普通图层后修改。
The Background layer is locked in place. Convert it to a layer to move it, mask it or make it transparent.	背景图层的位置已锁定。请转为普通图层后再移动、添加蒙版或设置透明度。
This part of Photo Studio could not be loaded. Check the connection and try again, or reload the page if Photo Studio has been updated.	无法加载此功能。请检查网络后重试；如果 Photo Studio 已更新，请刷新页面。
Nothing chosen yet.	尚未选择。
No document	没有文档
No selection	没有选区
Select a layer	选择图层
Open a document first.	请先打开文档。
Open an image first.	请先打开图像。
No layers selected.	未选择图层。
Select a pixel layer.	请选择像素图层。
No images to process.	没有可处理的图像。
Assistant	助手
Ask Assistant	询问助手
Generation History	生成历史
Libraries	资料库
Library	资料库
Comments	评论
Comment	评论
Version History	版本历史
Versions	版本
Save a Version	保存版本
Save Version	保存版本
Restore	恢复
Restore as a new history step	恢复为新的历史记录步骤
Preview on the canvas	在画布上预览
Stop previewing	停止预览
Exit	退出
Recovery	恢复
Recover Documents	恢复文档
Recover	恢复
Discard	丢弃
Keep	保留
Read-only	只读
View only	仅查看
Share	共享
Share for Review	共享以供审阅
Invite to Edit	邀请编辑
Stop Sharing	停止共享
Copy Link	复制链接
Copy link	复制链接
Owner	所有者
Editor	编辑者
Viewer	查看者
Send	发送
Post	发布
Reply	回复
Resolve	解决
Reopen	重新打开
Resolved	已解决
Removed	已移除
Edit message	编辑消息
Add a comment	添加评论
Write a comment	撰写评论
No comments yet	暂无评论
System Info	系统信息
About Photo Studio	关于 Photo Studio
Online Help	在线帮助
What’s New	新增功能
What's New	新增功能
Tutorials	教程
Close tutorial	关闭教程
Skip	跳过
Try it	试一试
Start tutorial	开始教程
Next step	下一步
Previous step	上一步
Restart	重新开始
An open-source image editor that runs in your browser, built on WebGPU with a WebGL2 fallback. Documents stay on your device unless you save them to Puter.	在浏览器中运行的开源图像编辑器，采用 WebGPU，并兼容 WebGL2。文档保存在你的设备上，也可主动保存到 Puter。
Photo Studio is an independent open-source project.	Photo Studio 是独立的开源项目。
Thumbnail size	缩览图大小
Thumbnail contents	缩览图内容
Choose the thumbnail size and what layer thumbnails show.	选择缩览图大小及图层缩览图的显示内容。
Layer bounds	图层边界
Measure again	重新测量
Mean	平均值
Std Dev	标准差
Median	中间值
Percentile	百分位
Level	色阶
Pixels	像素
Count	计数
Area	面积
Area (px)	面积（像素）
Luminance distribution from dark to light	由暗到亮的明度分布
Show each color channel	显示每个颜色通道
Pure black pixels	纯黑像素
Pure white pixels	纯白像素
Visible composite · transparent pixels excluded	可见图层合成 · 不含透明像素
Color (when Contents is Color)	颜色（内容为颜色时）
Filter by name	按名称筛选
Search fonts	搜索字体
Search shapes	搜索形状
Search brushes	搜索画笔
Search libraries	搜索资料库
Search styles	搜索样式
Search gradients	搜索渐变
Search patterns	搜索图案
Content	内容
Contents	内容
From	从
To	到
New window	新建窗口
View all	查看全部
More	更多
Advanced	高级
Advanced options	高级选项
Basic	基本
New documents are 8 bits per channel; open a 16 or 32-bit file to edit at high depth	新文档使用每通道 8 位；打开 16 位或 32 位文件可进行高位深编辑
Each artboard sets its own background.	每个画板分别设置背景。
Scales proportionally about the center.	以中心为基准等比缩放。
Groups and several layers scale proportionally	组和多个图层会等比缩放
Rotation in degrees	旋转角度（度）
Number keys set the opacity of the selected layers when no painting tool is active	未使用绘画工具时，可按数字键设置所选图层的不透明度
Record and self-signed manifest	记录和自签名清单
Record of how it was made	创作过程记录
This format gets the record only; signed manifests go into PNG and JPEG.	此格式仅包含记录；签名清单可写入 PNG 和 JPEG。
Buy the author a coffee	请作者喝杯咖啡
Save Project	保存项目
A .photo project saved on this device keeps layers	保存到本机的 .photo 项目可保留图层
Choose what the status bar shows	选择状态栏显示的内容
Unknown	未知
Mask moves with the layer (click to unlink)	蒙版随图层移动（点击取消链接）
Mask stays in place (click to link)	蒙版保持原位（点击链接）
Layer mask (click to edit, Shift-click to disable)	图层蒙版（点击编辑，按住 Shift 点击停用）
The data set was not applied: the document kept changing while it was prepared. Try again.	数据集未能应用：准备期间文档持续变化，请重试。
Choose the folder of replacement images (Data Sets…) to apply pixel replacement.	要应用像素替换，请先在“数据组…”中选择替换图像所在的文件夹。
Opens beside the dock; drag to rearrange.	在停靠栏旁打开；可拖动重新排列。
Cloud collaboration requires opening the app over HTTPS. Use a secure connection and try again.	云端协作需要通过 HTTPS 打开应用。请使用安全连接后重试。
This feature needs a Puter connection. Click the account button at the top right and connect after reading the note; local editing and exporting work without it.	此功能需要连接 Puter。请点击右上角账户按钮，阅读说明后连接；本地编辑和导出无需连接。
Digital signing needs the app opened over HTTPS. Ordinary image export and project saving still work.	数字签名需要通过 HTTPS 打开应用。普通图片导出和项目保存仍可使用。
Photo Studio uses the AGPL-3.0-only license. Third-party components include ag-psd (MIT), Lucide (ISC), pako (MIT/Zlib), PathKit (BSD-3-Clause), @noble/hashes (MIT), and Rust png (MIT/Apache-2.0). Bundled fonts are licensed under SIL Open Font License 1.1.	Photo Studio 采用 AGPL-3.0-only 许可。第三方组件包括 ag-psd（MIT）、Lucide（ISC）、pako（MIT/Zlib）、PathKit（BSD-3-Clause）、@noble/hashes（MIT）及 Rust png（MIT/Apache-2.0）。随附字体采用 SIL Open Font License 1.1。
Download the source of this version	下载此版本源码
View third-party notices	查看第三方许可
Upstream project	上游项目
UI language	界面语言
Restore Unsaved Documents?	恢复未保存的文档？
Photo Studio closed with unsaved changes. These documents were kept in this browser. Unchecked documents stay available to restore later.	Photo Studio 上次关闭时有未保存的更改。这些文档已保存在此浏览器中。取消勾选的文档稍后仍可恢复。
Restore parent documents with their contents tabs to keep them connected. Contents restored alone open as separate documents.	恢复父文档时会连同其内容标签页一起恢复，以保持关联。单独恢复的内容会作为独立文档打开。
Never saved	从未保存
Discard All	全部放弃
Not Now	暂不处理
Go Back	返回
Unsaved changes will be lost. This cannot be undone.	未保存的更改将会丢失。此操作无法撤销。
Recovered documents discarded.	已放弃恢复的文档。
`.trim();

export const zhCN: ReadonlyMap<string, string> = new Map(
  `${entries}\n${advancedEntries}\n${helpEntries}\n${supplementalEntries}\n${fileEntries}\n${dynamicEntries}\n${platformEntries}\n${fileUIEntries}\n${preferencesEntries}\n${commandEntries}`
    .split('\n')
    .filter((line) => line.includes('\t'))
    .map((line): [string, string] => {
      const tab = line.indexOf('\t');
      return [line.slice(0, tab).replace(/\\n/g, '\n'), line.slice(tab + 1).replace(/\\n/g, '\n')];
    }),
);
