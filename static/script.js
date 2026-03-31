document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('generate-form');
    const submitBtn = document.getElementById('generate-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    
    const loadingState = document.getElementById('loading-state');
    const loadingMessage = document.getElementById('loading-message');
    const mainProgressBar = document.getElementById('main-progress-bar');
    const progressText = document.getElementById('progress-text');
    
    // History elements
    const historySection = document.getElementById('history-section');
    const historyGrid = document.getElementById('history-grid');
    let sessionHistory = [];
    
    // Modal elements
    const modal = document.getElementById('slideshow-modal');
    const closeBtn = document.querySelector('.close-btn');
    const slideshowContainer = document.getElementById('slideshow-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('slide-progress');
    const slideCounter = document.getElementById('slide-counter');
    
    let slides = [];
    let slidesArrayData = []; // To hold data for PDF
    let currentSlideIndex = 0;
    let slideInterval;
    const SLIDE_DURATION = 5000; // 5 seconds per photo

    const loadingPhases = [
        "Analyzing narrative...",
        "Crafting visual prompts...",
        "Generating imagery...",
        "Finalizing slideshow..."
    ];

    let loadingInterval;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const text = document.getElementById('narrative-text').value;
        const style = document.getElementById('visual-style').value;
        const ratio = document.getElementById('image-ratio').value;
        
        if (!text.trim()) return;

        // UI Loading
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        loadingState.classList.remove('hidden');
        
        // Spin through loading messages
        let phaseIdx = 0;
        loadingMessage.textContent = loadingPhases[0];
        loadingInterval = setInterval(() => {
            phaseIdx = (phaseIdx + 1) % loadingPhases.length;
            loadingMessage.textContent = loadingPhases[phaseIdx];
        }, 3000);

        // Animate fake progress bar logic
        let progress = 0;
        mainProgressBar.style.width = '0%';
        progressText.textContent = '0%';
        
        let progressInterval = setInterval(() => {
            if (progress < 95) {
                // Slower increment as it approaches 95
                progress += (95 - progress) * 0.05;
                if (progress > 95) progress = 95;
                mainProgressBar.style.width = progress + '%';
                progressText.textContent = Math.round(progress) + '%';
            }
        }, 300);

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, style, ratio })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Generation failed");
            }

            const data = await response.json();
            
            // Add to session history
            const textSnippet = text.length > 40 ? text.substring(0, 40) + "..." : text;
            sessionHistory.unshift({
                id: Date.now(),
                snippet: textSnippet,
                panels: data.storyboard,
                thumbnail: data.storyboard[0]?.image || ''
            });
            renderHistory();
            
            openSlideshow(data.storyboard);
            
        } catch (error) {
            console.error("Error:", error);
            alert("An error occurred: " + error.message);
        } finally {
            clearInterval(loadingInterval);
            clearInterval(progressInterval);
            mainProgressBar.style.width = '100%';
            progressText.textContent = '100%';
            
            // Give brief 100% confirmation before hide
            setTimeout(() => {
                submitBtn.disabled = false;
                btnText.classList.remove('hidden');
                spinner.classList.add('hidden');
                loadingState.classList.add('hidden');
            }, 500);
        }
    });

    function openSlideshow(panels) {
        slideshowContainer.innerHTML = '';
        slides = [];
        slidesArrayData = panels; // store globally for PDF
        
        panels.forEach((panel, index) => {
            const slide = document.createElement('div');
            slide.className = 'slide' + (index === 0 ? ' active' : '');
            
            // Cleanly format text
            const textToDisplay = panel.polished_caption || panel.original_text;
            const cleanText = textToDisplay.replace(/^["']|["']$/g, '');
            
            slide.innerHTML = `
                <img src="${panel.image}" alt="Panel ${index + 1}">
                <div class="slide-caption">"${cleanText}"</div>
            `;
            slideshowContainer.appendChild(slide);
            slides.push(slide);
        });

        // Show modal and start slideshow
        modal.classList.remove('hidden');
        document.getElementById('download-pdf-btn').classList.remove('hidden');
        currentSlideIndex = 0;
        updateSlideCounter();
        
        // Slight delay before start so modal can fade in
        setTimeout(startSlideshow, 100);
    }

    function updateSlideCounter() {
        slideCounter.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
    }

    function renderHistory() {
        if (sessionHistory.length > 0) {
            historySection.classList.remove('hidden');
        }
        
        historyGrid.innerHTML = '';
        sessionHistory.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.title = `Story: "${item.snippet}"`;
            card.innerHTML = `<img src="${item.thumbnail}" alt="History Thumbnail">`;
            card.addEventListener('click', () => {
                openSlideshow(item.panels);
            });
            historyGrid.appendChild(card);
        });
    }

    function startSlideshow() {
        clearInterval(slideInterval);
        resetProgressBar();
        
        slideInterval = setInterval(() => {
            nextSlide();
        }, SLIDE_DURATION);
    }

    function resetProgressBar() {
        progressBar.style.transition = 'none';
        progressBar.style.width = '0%';
        
        // Force reflow
        void progressBar.offsetWidth;
        
        progressBar.style.transition = `width ${SLIDE_DURATION}ms linear`;
        progressBar.style.width = '100%';
    }

    function nextSlide() {
        slides[currentSlideIndex].classList.remove('active');
        currentSlideIndex = (currentSlideIndex + 1) % slides.length;
        slides[currentSlideIndex].classList.add('active');
        updateSlideCounter();
        startSlideshow();
    }

    function prevSlide() {
        slides[currentSlideIndex].classList.remove('active');
        currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
        slides[currentSlideIndex].classList.add('active');
        updateSlideCounter();
        startSlideshow();
    }

    function closeSlideshow() {
        modal.classList.add('hidden');
        clearInterval(slideInterval);
    }

    nextBtn.addEventListener('click', nextSlide);
    prevBtn.addEventListener('click', prevSlide);
    closeBtn.addEventListener('click', closeSlideshow);
    
    // PDF Download Logic
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    downloadPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        
        // A4 Paper Landscape (297mm x 210mm)
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });
        
        const pagewidth = doc.internal.pageSize.getWidth();
        const pageheight = doc.internal.pageSize.getHeight();
        
        // Temporarily pause slideshow while processing
        clearInterval(slideInterval);
        downloadPdfBtn.textContent = 'Generating...';
        downloadPdfBtn.disabled = true;
        
        // setTimeout to allow UI to update to 'Generating...' before locking the main thread
        setTimeout(() => {
            slidesArrayData.forEach((panel, index) => {
                if (index > 0) {
                    doc.addPage();
                }
                
                // Get image dimensions directly if possible, or just force to fit nicely
                const imgHeightStr = 140; // mm (about 65% of 210mm height)
                
                // We'll calculate width dynamically to keep aspect ratio if needed, but since we don't know the exact ratio here cleanly, 
                // Let's assume most are widescreen generated or square. 
                // A great fallback is to let jsPDF scale it to the specified max width/height if we don't specify explicit width or 
                // if we give it a conservative box.
                // Wait, jspdf needs both w and h unless we just give it an image and let it calculate. 
                // let's just make it a good size box.
                const imgProps = doc.getImageProperties(panel.image);
                const ratio = imgProps.width / imgProps.height;
                const finalWidth = imgHeightStr * ratio;
                
                const xOffset = (pagewidth - finalWidth) / 2;
                const yOffset = 15;
                
                doc.addImage(panel.image, 'JPEG', xOffset, yOffset, finalWidth, imgHeightStr);
                
                // Add Caption below image
                doc.setFont("helvetica", "normal");
                doc.setFontSize(14);
                doc.setTextColor(50, 50, 50);
                
                const textToDisplay = panel.polished_caption || panel.original_text;
                const cleanText = textToDisplay.replace(/^["']|["']$/g, '');
                
                // Use doc.splitTextToSize for word wrap
                const splitTitle = doc.splitTextToSize(`"${cleanText}"`, pagewidth - 40);
                doc.text(splitTitle, pagewidth / 2, yOffset + imgHeightStr + 15, {
                    align: 'center'
                });
            });
            
            doc.save('the-pitch-visualizer-storyboard.pdf');
            
            downloadPdfBtn.textContent = 'Download PDF';
            downloadPdfBtn.disabled = false;
            // Resume timer
            startSlideshow();
        }, 100);
    });

    // Stop event propagation inside modal content so clicking outside works strictly
    modal.querySelector('.modal-content').addEventListener('click', e => {
        e.stopPropagation();
    });
    
    modal.addEventListener('click', closeSlideshow);
});
