// White-label config: change these to resell the CRM to another school.
export const brand = {
  name: 'Kinderbee CRM',
  school: 'Kinderbee International Preschool',
  city: 'Bengaluru',
  address: 'No. 1, Old UCO Bank Road, Rajarajeshwari Layout, Ramamurthy Nagar, Bengaluru – 560016',
  phone: '+91 81223 44040',
  email: 'kinderbeeschools@gmail.com',
  logo: '/logo.png', // drop your logo at public/logo.png
  websiteUrl: 'https://www.kinderbeeschools.com', // Website Content module edits this site's images
  loginDomain: 'kinderbee.local', // usernames sign in as <username>@<loginDomain>; keep in sync with LOGIN_DOMAIN in edge functions
  colors: {
    primary: '#FFC107', // honey
    charcoal: '#2B2B2B',
    cream: '#FFF8E7',
  },
}
