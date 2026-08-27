document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (btn && menu) {
        btn.addEventListener('click', () => menu.classList.toggle('hidden'));
    }

    document.querySelectorAll('.reveal').forEach((el, i) => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setTimeout(() => entry.target.classList.add('visible'), i * 40);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        observer.observe(el);
    });

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending…';
            const data = {
                name: document.getElementById('contact-name').value,
                email: document.getElementById('contact-email').value,
                phone: document.getElementById('contact-phone').value,
                message: document.getElementById('contact-message').value,
                _subject: 'Gymmy website — new contact message',
                _template: 'table',
                _captcha: 'false'
            };

            let emailed = false;
            try {
                const mail = await fetch('https://formsubmit.co/ajax/GymmyNJ@yahoo.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(data)
                });
                emailed = mail.ok;
            } catch (err) {
                console.error('FormSubmit failed', err);
            }

            try {
                await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } catch (err) {
                console.error('API save failed', err);
            }

            if (emailed) {
                contactForm.classList.add('hidden');
                document.getElementById('form-success').classList.remove('hidden');
            } else {
                alert('Message saved, but email may need a one-time confirmation. Check GymmyNJ@yahoo.com (and spam) for an email from FormSubmit and click Confirm.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
            }
        });
    }
});
