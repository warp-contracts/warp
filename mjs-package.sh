cat > lib/mjs/package.json <<!EOF
{
    "type": "module"
}
!EOF
cat > lib/mjs/index.d.ts <<!EOF
export * from '../types/index.d'
!EOF
