import type { SVGProps } from 'react';

// The letter is a heavy italic "m" (Newsreader, wght 800, opsz 72),
// outlined so the mark renders identically everywhere. The cobalt
// full stop echoes the punctuated headlines ("Every slide, understood.").
const M_PATH =
  'M1581 89 1458 157Q1509 154 1566.0 162.5Q1623 171 1697.0 213.0Q1771 255 1870 351L1882 340Q1787 207 1695.0 125.5Q1603 44 1515.5 7.0Q1428 -30 1346 -30Q1241 -30 1204.5 18.5Q1168 67 1198 139L1373 556Q1413 651 1424.5 687.0Q1436 723 1436 745Q1436 766 1424.5 776.0Q1413 786 1393 786Q1364 786 1333.5 763.0Q1303 740 1273.5 701.5Q1244 663 1217.0 614.5Q1190 566 1168 515L986 0H585L781 556Q807 629 819.5 667.5Q832 706 836.5 725.0Q841 744 841 756Q841 770 833.0 778.0Q825 786 808 786Q781 786 751.0 763.0Q721 740 691.5 701.0Q662 662 635.5 614.0Q609 566 587 515L411 0H23L282 765Q292 794 288.0 811.0Q284 828 262 828Q238 828 208.0 813.0Q178 798 139.5 749.5Q101 701 48 598L36 604Q104 777 171.5 873.5Q239 970 320.0 1009.0Q401 1048 507 1048Q552 1048 584.5 1046.0Q617 1044 648.0 1038.5Q679 1033 720 1024L565 534H558Q633 698 693.5 800.5Q754 903 808.0 958.0Q862 1013 917.0 1033.5Q972 1054 1035 1054Q1138 1054 1183.5 1000.5Q1229 947 1229 869Q1229 829 1217.5 775.0Q1206 721 1171 611L1123 459H1101Q1189 645 1257.5 762.0Q1326 879 1385.0 942.5Q1444 1006 1504.5 1030.0Q1565 1054 1638 1054Q1754 1054 1807.0 998.5Q1860 943 1860 865Q1860 825 1848.5 771.5Q1837 718 1793 611Z';
const M_TRANSFORM = 'translate(7.042 41.989) scale(0.01990 -0.01990)';

/** The app mark. Colors follow the theme: an ink tile in light mode, paper in dark. */
export function LogoMark({
  size = 28,
  ...props
}: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden {...props}>
      <rect width="64" height="64" rx="15" style={{ fill: 'var(--ink)' }} />
      <path transform={M_TRANSFORM} d={M_PATH} style={{ fill: 'var(--bg)' }} />
      <circle cx="52.10" cy="37.59" r="4.4" style={{ fill: 'var(--accent)' }} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span>Mnemo</span>
    </span>
  );
}
