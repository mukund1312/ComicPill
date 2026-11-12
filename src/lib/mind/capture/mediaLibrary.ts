// ComicPill no longer reads the photo gallery: pictures come only from the system photo picker and the camera, which need no gallery
// permission. Anything that used to scan an album goes through here and simply finds nothing.
export const galleryAvailable = () => false;
