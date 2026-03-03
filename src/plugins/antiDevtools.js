/**
 * Vite plugin to inject anti-devtools script in production builds only.
 */
export default function antiDevtoolsPlugin() {
  return {
    name: 'anti-devtools',
    transformIndexHtml(html) {
      if (process.env.NODE_ENV !== 'production') return html;

      const script = `<script>!function(){document.addEventListener("contextmenu",function(e){e.preventDefault()});document.addEventListener("keydown",function(e){if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&(e.key==="I"||e.key==="J"||e.key==="C"))||(e.ctrlKey&&e.key==="u")||(e.metaKey&&e.altKey&&e.key==="i")){e.preventDefault()}})}();</script>`;

      return html.replace('</head>', script + '</head>');
    },
  };
}
